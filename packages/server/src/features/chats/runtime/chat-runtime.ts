/**
 * Chat turn runtime — owns the live agent processes and the chat WebSocket.
 *
 * Like the PTY sessions and the Local Dev process manager, this lives outside
 * the Effect runtime: a turn is a long-lived child process whose stream must
 * keep flowing (and be persisted) whether or not any request — or any socket —
 * is around. The Effect service layer calls in through plain functions.
 *
 * One turn at a time per chat. A turn spawns the provider CLI (see
 * providers.ts), feeds the prompt through stdin, parses stdout NDJSON into
 * canonical events (claude-stream.ts), persists progress through the shared
 * store, and broadcasts wire events to every socket watching the chat:
 *
 *   server → client: { snapshot: Chat }                        // on connect
 *                    { event: { type: "turn-started", chat } }
 *                    { event: { type: "delta", messageId, text } }
 *                    { event: { type: "activity", activity } }
 *                    { event: { type: "turn-completed", turn, messageId, text } }
 *                    { error: string }                          // then close
 */
import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { WebSocket } from "ws"
import { recentAgentSessions } from "../../../layers/terminal/agent-session-capture.ts"
import { getCurrentRepo } from "../../../layers/workspace/current-repo.ts"
import { chatTurnProgram, type ChatTurnSession } from "../providers.ts"
import type {
  Chat,
  ChatActivity,
  ChatMessage,
  ChatTurn,
} from "../schema/chats.schema.model.ts"
import {
  appendActivity,
  appendTurnStart,
  completeTurn,
  findChat,
  nextChatId,
  saveSessionId,
} from "../store.ts"
import {
  createTurnParser,
  type TurnEvent,
  type TurnParser,
} from "./turn-parser.ts"

export const CHAT_STREAM_PATH = "/api/chats/stream"

interface LiveTurn {
  readonly chatId: string
  readonly turnId: string
  readonly assistantMessageId: string
  /** Captured at start so a mid-turn repo switch still persists correctly. */
  readonly repoPath: string
  readonly provider: Chat["provider"]
  /** Spawn time — the floor for scanning freshly-minted CLI session files. */
  readonly startedAtMs: number
  readonly child: ChildProcess
  readonly parser: TurnParser
  /** Result seen on the stream (settles the turn even if exit is unclean). */
  result: Extract<TurnEvent, { type: "result" }> | null
  stderr: string
  interrupted: boolean
  finalized: boolean
}

const liveTurns = new Map<string, LiveTurn>()
/** Sockets watching a chat (with or without a running turn), by chat id. */
const watchers = new Map<string, Set<WebSocket>>()

const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

const broadcast = (chatId: string, event: unknown) => {
  const sockets = watchers.get(chatId)
  if (sockets === undefined) return
  for (const ws of sockets) send(ws, { event })
}

export const isTurnRunning = (chatId: string): boolean => liveTurns.has(chatId)

/**
 * The chat as a client should first see it: the persisted state with the
 * in-flight assistant text merged in, and — after a server restart that
 * orphaned a "running" turn — that stale turn settled as interrupted.
 */
const snapshotChat = (repoPath: string, chat: Chat): Chat => {
  const live = liveTurns.get(chat.id)
  if (live !== undefined) {
    const text = live.parser.text()
    return {
      ...chat,
      messages: chat.messages.map((m) =>
        m.id === live.assistantMessageId ? { ...m, text } : m
      ),
    }
  }
  if (chat.latestTurn !== null && chat.latestTurn.state === "running") {
    const settled = completeTurn(repoPath, chat.id, {
      turnId: chat.latestTurn.id,
      assistantMessageId: chat.messages.findLast((m) => m.streaming)?.id ?? "",
      text: chat.messages.findLast((m) => m.streaming)?.text ?? "",
      state: "interrupted",
      errorMessage: "the server restarted while this turn was running",
      totalCostUsd: null,
      endedAt: new Date().toISOString(),
    })
    if (settled !== undefined) return settled
  }
  return chat
}

const handleStreamEvent = (live: LiveTurn, event: TurnEvent): void => {
  switch (event.type) {
    case "session": {
      // Persist once confirmed by the CLI so a pre-init failure retries with
      // a fresh id instead of resuming a session that never existed.
      const chat = findChat(live.repoPath, live.chatId)
      if (chat !== undefined && chat.sessionId === null) {
        saveSessionId(live.repoPath, live.chatId, event.sessionId)
      }
      return
    }
    case "delta":
      broadcast(live.chatId, {
        type: "delta",
        messageId: live.assistantMessageId,
        text: event.text,
      })
      return
    case "activity": {
      const activity: ChatActivity = {
        id: nextChatId("a"),
        turnId: live.turnId,
        kind: event.kind,
        tone: event.tone,
        summary: event.summary,
        detail: event.detail,
        createdAt: new Date().toISOString(),
      }
      appendActivity(live.repoPath, live.chatId, activity)
      broadcast(live.chatId, { type: "activity", activity })
      return
    }
    case "result":
      live.result = event
      return
  }
}

/**
 * opencode never reports its session id on stdout (and older codex versions
 * don't either) — recover it from the CLI's own session files, exactly like
 * the PTY threads do, so the next turn can `--session`/`resume` it.
 */
const captureMintedSession = (live: LiveTurn): void => {
  if (live.provider === "claude") return
  try {
    const chat = findChat(live.repoPath, live.chatId)
    if (chat === undefined || chat.sessionId !== null) return
    const found = recentAgentSessions(
      live.provider,
      live.repoPath,
      live.startedAtMs
    )
    if (found.length === 0) return
    const newest = found.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a))
    saveSessionId(live.repoPath, live.chatId, newest.id)
  } catch {
    // best-effort — an uncaptured session just means the next turn starts fresh
  }
}

const finalizeTurn = (live: LiveTurn, exitCode: number | null): void => {
  if (live.finalized) return
  live.finalized = true
  liveTurns.delete(live.chatId)
  captureMintedSession(live)

  const state: ChatTurn["state"] = live.interrupted
    ? "interrupted"
    : live.result !== null
      ? live.result.state
      : exitCode === 0
        ? "completed"
        : "error"
  const stderrTail = live.stderr.trim().slice(-500)
  const errorMessage =
    state === "error"
      ? (live.result?.errorMessage ??
        (stderrTail.length > 0 ? stderrTail : `agent exited (${exitCode})`))
      : null
  const endedAt = new Date().toISOString()
  const text = live.parser.text()

  const updated = completeTurn(live.repoPath, live.chatId, {
    turnId: live.turnId,
    assistantMessageId: live.assistantMessageId,
    text,
    state,
    errorMessage,
    totalCostUsd: live.result?.totalCostUsd ?? null,
    endedAt,
  })
  const turn =
    updated?.latestTurn ??
    ({
      id: live.turnId,
      state,
      startedAt: endedAt,
      endedAt,
      errorMessage,
      totalCostUsd: live.result?.totalCostUsd ?? null,
    } satisfies ChatTurn)
  broadcast(live.chatId, {
    type: "turn-completed",
    turn,
    messageId: live.assistantMessageId,
    text,
  })
}

export interface StartTurnResult {
  readonly ok: boolean
  readonly reason?: "busy" | "not-found"
}

/**
 * Start a turn: persist the user message + a streaming assistant placeholder,
 * spawn the agent, and stream. Returns synchronously once the process is
 * launched; progress flows over the chat WebSocket.
 */
export const startChatTurn = (
  repoPath: string,
  chatId: string,
  text: string
): StartTurnResult => {
  if (liveTurns.has(chatId)) return { ok: false, reason: "busy" }
  const chat = findChat(repoPath, chatId)
  if (chat === undefined) return { ok: false, reason: "not-found" }

  const now = new Date().toISOString()
  const turnId = nextChatId("turn")
  const userMessage: ChatMessage = {
    id: nextChatId("m"),
    role: "user",
    text,
    turnId,
    streaming: false,
    createdAt: now,
  }
  const assistantMessage: ChatMessage = {
    id: nextChatId("m"),
    role: "assistant",
    text: "",
    turnId,
    streaming: true,
    createdAt: now,
  }
  const turn: ChatTurn = {
    id: turnId,
    state: "running",
    startedAt: now,
    endedAt: null,
    errorMessage: null,
    totalCostUsd: null,
  }

  // Claude lets us mint the session id up-front; codex/opencode mint their
  // own, so a fresh chat launches without one and the id is captured later.
  const session: ChatTurnSession =
    chat.provider === "claude"
      ? { id: chat.sessionId ?? randomUUID(), resume: chat.sessionId !== null }
      : { id: chat.sessionId, resume: chat.sessionId !== null }
  const program = chatTurnProgram(chat, text, session)
  const started = appendTurnStart(repoPath, chatId, {
    turn,
    userMessage,
    assistantMessage,
  })
  if (started === undefined) return { ok: false, reason: "not-found" }

  const child = spawn(program.file, [...program.args], {
    cwd: repoPath,
    env: {
      ...process.env,
      ...program.env,
      BYCONVO_CHAT_ID: chatId,
      BYCONVO_API: `http://localhost:${process.env["BYCONVO_PORT"] ?? 41811}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
  })

  const live: LiveTurn = {
    chatId,
    turnId,
    assistantMessageId: assistantMessage.id,
    repoPath,
    provider: chat.provider,
    startedAtMs: Date.now(),
    child,
    parser: createTurnParser(chat.provider),
    result: null,
    stderr: "",
    interrupted: false,
    finalized: false,
  }
  liveTurns.set(chatId, live)
  broadcast(chatId, { type: "turn-started", chat: started })

  child.stdin?.write(program.stdin)
  child.stdin?.end()

  let pending = ""
  child.stdout?.setEncoding("utf8")
  child.stdout?.on("data", (data: string) => {
    pending += data
    let newline = pending.indexOf("\n")
    while (newline !== -1) {
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      for (const event of live.parser.push(line)) {
        handleStreamEvent(live, event)
      }
      newline = pending.indexOf("\n")
    }
  })
  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (data: string) => {
    // Keep a bounded tail — it becomes the error message on a dirty exit.
    live.stderr = (live.stderr + data).slice(-4000)
  })
  child.on("error", (error) => {
    live.stderr = `${live.stderr}\n${error.message}`
    finalizeTurn(live, null)
  })
  child.on("close", (code) => {
    // Flush a final unterminated line before settling.
    if (pending.length > 0) {
      for (const event of live.parser.push(pending)) {
        handleStreamEvent(live, event)
      }
      pending = ""
    }
    finalizeTurn(live, code)
  })

  return { ok: true }
}

/** Interrupt a running turn. Returns false when nothing was running. */
export const stopChatTurn = (chatId: string): boolean => {
  const live = liveTurns.get(chatId)
  if (live === undefined) return false
  live.interrupted = true
  try {
    live.child.kill("SIGTERM")
  } catch {
    // already gone
  }
  const hard = setTimeout(() => {
    try {
      live.child.kill("SIGKILL")
    } catch {
      // already gone
    }
  }, 3000)
  live.child.once("close", () => clearTimeout(hard))
  return true
}

/** Tear down everything for a deleted chat: process and sockets. */
export const killChatRuntime = (chatId: string): void => {
  stopChatTurn(chatId)
  const sockets = watchers.get(chatId)
  if (sockets !== undefined) {
    watchers.delete(chatId)
    for (const ws of sockets) {
      try {
        ws.close()
      } catch {
        // already gone
      }
    }
  }
}

/**
 * Attach a chat-stream WebSocket (routed here by the upgrade dispatcher in
 * pty-socket.ts). Sends the snapshot, then live events until either side
 * closes. Read-only: mutations go through the REST API.
 */
export const startChatStream = (
  ws: WebSocket,
  request: IncomingMessage
): void => {
  const url = new URL(request.url ?? "", "http://localhost")
  const chatId = url.searchParams.get("chat") ?? ""
  const repoPath = getCurrentRepo()
  if (chatId.length === 0 || repoPath === null) {
    send(ws, { error: "no chat selected or no repository open" })
    ws.close()
    return
  }
  let chat: Chat | undefined
  try {
    chat = findChat(repoPath, chatId)
  } catch {
    chat = undefined
  }
  if (chat === undefined) {
    send(ws, { error: `chat ${chatId} not found` })
    ws.close()
    return
  }

  send(ws, { snapshot: snapshotChat(repoPath, chat) })
  const sockets = watchers.get(chatId) ?? new Set<WebSocket>()
  sockets.add(ws)
  watchers.set(chatId, sockets)
  ws.on("close", () => {
    sockets.delete(ws)
    if (sockets.size === 0) watchers.delete(chatId)
  })
}

/** Test seam: reset all in-memory runtime state. */
export const resetChatRuntime = (): void => {
  for (const chatId of [...liveTurns.keys()]) stopChatTurn(chatId)
  liveTurns.clear()
  watchers.clear()
}
