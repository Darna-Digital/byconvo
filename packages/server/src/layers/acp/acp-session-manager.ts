/**
 * AcpSessionManager — owns the long-running ACP agent subprocesses, one per chat.
 *
 * Like a Local Dev process (dev-process-manager.ts) or a terminal PTY
 * (pty-socket.ts), an ACP session must outlive any single WebSocket: closing the
 * tab only *detaches* the viewer, the agent keeps its turn running, and a
 * reconnecting client is caught up. But where a PTY replays a raw byte buffer,
 * a chat replays a *structured* transcript — so the manager keeps the working
 * `Chat` in memory (seeded from disk) and, on attach, sends it as a `snapshot`;
 * subsequent streamed events (`delta`/`message`) apply on top. No byte buffer is
 * needed: the in-memory transcript is always the full, current truth.
 *
 * The connection is injected (`createAcpSessionManager({ connect })`) so the
 * registry is unit-testable with a scripted fake agent; the production singleton
 * (see acp-socket.ts) wraps `spawnAcpConnection`. Persistence and disk reads are
 * likewise injected so the manager never touches the filesystem in a test.
 *
 * WS wire protocol (JSON text frames):
 *   client → server: { prompt: { text } } | { cancel: true }
 *                     | { permission: { requestId, optionId } | { requestId, cancelled: true } }
 *   server → client: { t:"snapshot", messages } | { t:"delta", id, role, text }
 *                     | { t:"message", message } | { t:"busy", busy }
 *                     | { t:"status", state, detail? } | { t:"error", message }
 */
import type { WebSocket } from "ws"
import type {
  ContentBlock,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@zed-industries/agent-client-protocol"
import type {
  AcpClientHandlers,
  AcpConnection,
  ConnectFn,
} from "./acp-connection.ts"
import {
  appendMessage,
  resolvePermission,
  setAgentSessionId,
  upsertToolCall,
  type ToolCallPatch,
} from "../../features/chats/store/chats-ops.ts"
import type {
  Chat,
  ChatMessage,
  ToolContent,
} from "../../features/chats/schema/chats.schema.model.ts"

export type WsEvent =
  | { t: "snapshot"; messages: ReadonlyArray<ChatMessage> }
  | { t: "delta"; id: string; role: "agent" | "thought"; text: string }
  | { t: "message"; message: ChatMessage }
  | { t: "busy"; busy: boolean }
  | { t: "status"; state: "connecting" | "ready" | "error"; detail?: string }
  | { t: "error"; message: string }

export interface PersistUpdate {
  readonly messages: ReadonlyArray<ChatMessage>
  readonly agentSessionId: string | null
}

export interface AcpManagerDeps {
  readonly connect: ConnectFn
  /** Read a chat (with its persisted transcript) + its repo root, or null. */
  readonly loadChat: (chatId: string) => { repoPath: string; chat: Chat } | null
  /** Persist a chat's live transcript + ACP session id (merge on disk). */
  readonly persist: (
    chatId: string,
    repoPath: string,
    update: PersistUpdate
  ) => void
  readonly now?: () => string
  readonly genId?: (prefix: string) => string
}

export interface AcpSessionManager {
  /** Attach a viewer: (create the session if needed), snapshot + stream. */
  readonly attach: (chatId: string, ws: WebSocket) => void
  /** Cancel the in-flight turn for a chat, if any. */
  readonly cancel: (chatId: string) => void
  /** Kill the agent subprocess and forget the chat (on delete). */
  readonly kill: (chatId: string) => void
  /** Live turn state, for tests. */
  readonly isBusy: (chatId: string) => boolean
}

interface AcpSession {
  readonly chatId: string
  readonly repoPath: string
  chat: Chat
  conn: AcpConnection | null
  loadSupported: boolean
  /** Set while a `session/load` replay is in flight — its updates are ignored
   * (we already hold the transcript, so recording them would duplicate). */
  loading: boolean
  connecting: Promise<boolean> | null
  connectError: string | null
  initialPromptSent: boolean
  turnActive: boolean
  client: WebSocket | null
  openAgentId: string | null
  openThoughtId: string | null
  /** requestId → resolver for an in-flight permission ask. */
  readonly pendingPermissions: Map<
    string,
    (r: RequestPermissionResponse) => void
  >
}

const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

const STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
] as const
type StopReason = (typeof STOP_REASONS)[number]
const normalizeStop = (reason: string): StopReason =>
  (STOP_REASONS as ReadonlyArray<string>).includes(reason)
    ? (reason as StopReason)
    : "end_turn"

/** ACP `ContentBlock` → the plain text we accumulate for a message bubble. */
const blockText = (block: ContentBlock | undefined): string => {
  if (block === undefined) return ""
  if (block.type === "text") return block.text
  return `[${block.type}]`
}

/** ACP `ToolCallContent[]` → the display fragments we persist on a tool card. */
const toolContents = (
  items: ReadonlyArray<unknown> | null | undefined
): ToolContent[] => {
  if (items == null) return []
  const out: ToolContent[] = []
  for (const raw of items) {
    const it = raw as { type?: string; [k: string]: unknown }
    if (it.type === "content") {
      const c = it["content"] as { type?: string; text?: string } | undefined
      if (c?.type === "text") out.push({ type: "text", text: c.text ?? "" })
      else if (c?.type !== undefined)
        out.push({ type: "text", text: `[${c.type}]` })
    } else if (it.type === "diff") {
      out.push({
        type: "diff",
        path: String(it["path"] ?? ""),
        oldText: (it["oldText"] as string | null | undefined) ?? null,
        newText: String(it["newText"] ?? ""),
      })
    } else if (it.type === "terminal") {
      out.push({ type: "terminal", terminalId: String(it["terminalId"] ?? "") })
    }
  }
  return out
}

const toolLocations = (
  locations: ReadonlyArray<{ path?: string }> | null | undefined
): string[] =>
  locations == null
    ? []
    : locations.map((l) => l.path ?? "").filter((p) => p.length > 0)

export const createAcpSessionManager = (
  deps: AcpManagerDeps
): AcpSessionManager => {
  const now = deps.now ?? (() => new Date().toISOString())
  let counter = 0
  const genId =
    deps.genId ??
    ((prefix: string) => {
      counter += 1
      return `${prefix}-${Date.now().toString(36)}-${counter}`
    })

  const sessions = new Map<string, AcpSession>()

  const emit = (session: AcpSession, event: WsEvent) => {
    if (session.client !== null) send(session.client, event)
  }

  const flush = (session: AcpSession) =>
    deps.persist(session.chatId, session.repoPath, {
      messages: session.chat.messages,
      agentSessionId: session.chat.agentSessionId,
    })

  /** Append a structural message, stream it, and persist. */
  const commit = (session: AcpSession, message: ChatMessage) => {
    session.chat = appendMessage(session.chat, message, now())
    emit(session, { t: "message", message })
    flush(session)
  }

  const closeOpenText = (session: AcpSession) => {
    session.openAgentId = null
    session.openThoughtId = null
  }

  /** Accumulate streamed assistant/reasoning text into its open message. */
  const appendText = (
    session: AcpSession,
    role: "agent" | "thought",
    text: string
  ) => {
    if (text.length === 0) return
    const openId =
      role === "agent" ? session.openAgentId : session.openThoughtId
    if (openId === null) {
      const id = genId("m")
      const message: ChatMessage = { _tag: role, id, text, createdAt: now() }
      session.chat = appendMessage(session.chat, message, now())
      if (role === "agent") session.openAgentId = id
      else session.openThoughtId = id
      emit(session, { t: "message", message })
    } else {
      session.chat = {
        ...session.chat,
        updatedAt: now(),
        messages: session.chat.messages.map((m) =>
          m.id === openId && (m._tag === "agent" || m._tag === "thought")
            ? { ...m, text: m.text + text }
            : m
        ),
      }
      emit(session, { t: "delta", id: openId, role, text })
    }
  }

  const applyToolCall = (session: AcpSession, patch: ToolCallPatch) => {
    session.chat = upsertToolCall(session.chat, patch, genId("m"), now())
    const message = session.chat.messages.find(
      (m) => m._tag === "toolCall" && m.toolCallId === patch.toolCallId
    )
    if (message !== undefined) emit(session, { t: "message", message })
    flush(session)
  }

  const onSessionUpdate = (session: AcpSession, p: SessionNotification) => {
    if (session.loading) return
    const u = p.update
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        appendText(session, "agent", blockText(u.content))
        break
      case "agent_thought_chunk":
        appendText(session, "thought", blockText(u.content))
        break
      case "user_message_chunk":
        // The user's turn is already recorded when we send the prompt.
        break
      case "tool_call":
        closeOpenText(session)
        applyToolCall(session, {
          toolCallId: u.toolCallId,
          title: u.title,
          kind: u.kind ?? null,
          status: u.status ?? "pending",
          rawInput: u.rawInput ?? null,
          content: toolContents(u.content),
          locations: toolLocations(u.locations),
        })
        break
      case "tool_call_update":
        applyToolCall(session, {
          toolCallId: u.toolCallId,
          title: u.title ?? undefined,
          kind: u.kind ?? undefined,
          status: u.status ?? undefined,
          rawInput: u.rawInput,
          content: u.content == null ? undefined : toolContents(u.content),
          locations:
            u.locations == null ? undefined : toolLocations(u.locations),
        })
        break
      case "plan":
        closeOpenText(session)
        commit(session, {
          _tag: "plan",
          id: genId("m"),
          entries: u.entries.map((e) => ({
            content: e.content,
            priority: e.priority,
            status: e.status,
          })),
          createdAt: now(),
        })
        break
      default:
        // available_commands_update / current_mode_update — ignored in v1.
        break
    }
  }

  const onRequestPermission = (
    session: AcpSession,
    p: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> => {
    closeOpenText(session)
    const requestId = genId("pr")
    const message: ChatMessage = {
      _tag: "permission",
      id: genId("m"),
      requestId,
      toolCallId: p.toolCall?.toolCallId ?? null,
      title: p.toolCall?.title ?? "Permission required",
      options: p.options.map((o) => ({
        optionId: o.optionId,
        name: o.name,
        kind: o.kind,
      })),
      outcome: null,
      createdAt: now(),
    }
    commit(session, message)
    return new Promise<RequestPermissionResponse>((resolve) => {
      session.pendingPermissions.set(requestId, resolve)
    })
  }

  const respondPermission = (
    session: AcpSession,
    requestId: string,
    optionId: string | null
  ) => {
    const resolver = session.pendingPermissions.get(requestId)
    if (resolver === undefined) return
    session.pendingPermissions.delete(requestId)
    resolver(
      optionId === null
        ? { outcome: { outcome: "cancelled" } }
        : { outcome: { outcome: "selected", optionId } }
    )
    session.chat = resolvePermission(
      session.chat,
      requestId,
      {
        outcome: optionId === null ? "cancelled" : "selected",
        optionId,
      },
      now()
    )
    const message = session.chat.messages.find(
      (m) => m._tag === "permission" && m.requestId === requestId
    )
    if (message !== undefined) emit(session, { t: "message", message })
    flush(session)
  }

  /** Resolve every pending permission as cancelled (turn cancel / kill). */
  const cancelPendingPermissions = (session: AcpSession) => {
    for (const requestId of [...session.pendingPermissions.keys()]) {
      respondPermission(session, requestId, null)
    }
  }

  const buildHandlers = (session: AcpSession): AcpClientHandlers => ({
    sessionUpdate: async (p) => onSessionUpdate(session, p),
    requestPermission: (p) => onRequestPermission(session, p),
    readTextFile: async (p) => {
      const { readFileSync } = await import("node:fs")
      const text = readFileSync(p.path, "utf8")
      if (p.line == null && p.limit == null) return { content: text }
      const lines = text.split("\n")
      const start = p.line == null ? 0 : Math.max(0, p.line - 1)
      const end = p.limit == null ? lines.length : start + p.limit
      return { content: lines.slice(start, end).join("\n") }
    },
    writeTextFile: async (p) => {
      const { mkdirSync, writeFileSync } = await import("node:fs")
      const { dirname } = await import("node:path")
      mkdirSync(dirname(p.path), { recursive: true })
      writeFileSync(p.path, p.content)
      return {}
    },
  })

  const onChildExit = (
    session: AcpSession,
    exit: { code: number | null; error?: string }
  ) => {
    session.conn = null
    session.connecting = null
    cancelPendingPermissions(session)
    if (session.turnActive) {
      session.turnActive = false
      emit(session, { t: "busy", busy: false })
    }
    const detail =
      exit.error ??
      `the agent exited${exit.code == null ? "" : ` (${exit.code})`}`
    session.connectError = detail
    emit(session, { t: "status", state: "error", detail })
  }

  const ensureConnected = (session: AcpSession): Promise<boolean> => {
    if (session.conn !== null) return Promise.resolve(true)
    if (session.connecting !== null) return session.connecting
    const attempt = (async (): Promise<boolean> => {
      emit(session, { t: "status", state: "connecting" })
      try {
        const conn = deps.connect(
          session.chat.agent,
          session.repoPath,
          buildHandlers(session),
          (exit) => onChildExit(session, exit)
        )
        session.conn = conn
        const init = await conn.initialize()
        session.loadSupported = init.agentCapabilities?.loadSession ?? false

        if (session.chat.agentSessionId !== null && session.loadSupported) {
          // Resume: the agent replays history via session/update — ignore those
          // (we already hold the transcript) by loading with `loading` set.
          session.loading = true
          try {
            await conn.loadSession(
              session.chat.agentSessionId,
              session.repoPath
            )
          } finally {
            session.loading = false
          }
        } else {
          // Fresh session (or an agent that can't resume). Keep the persisted
          // transcript for display; mint a new ACP session id going forward.
          const { sessionId } = await conn.newSession(session.repoPath)
          session.chat = setAgentSessionId(session.chat, sessionId, now())
          flush(session)
        }
        session.connectError = null
        emit(session, { t: "status", state: "ready" })
        maybeSendInitialPrompt(session)
        return true
      } catch (error) {
        const detail =
          (error instanceof Error ? error.message : String(error)) ||
          "could not start the agent"
        const stderr = session.conn?.stderr().trim()
        session.connectError = stderr ? `${detail}\n${stderr}` : detail
        session.conn?.kill()
        session.conn = null
        emit(session, {
          t: "status",
          state: "error",
          detail: session.connectError,
        })
        return false
      } finally {
        session.connecting = null
      }
    })()
    session.connecting = attempt
    return attempt
  }

  const runTurn = async (session: AcpSession, text: string) => {
    const conn = session.conn
    if (conn === null || session.chat.agentSessionId === null) return
    if (session.turnActive) return // one turn at a time in v1
    closeOpenText(session)
    commit(session, {
      _tag: "user",
      id: genId("m"),
      text,
      createdAt: now(),
    })
    session.turnActive = true
    emit(session, { t: "busy", busy: true })
    const blocks: ContentBlock[] = [{ type: "text", text }]
    try {
      const res = await conn.prompt(session.chat.agentSessionId, blocks)
      closeOpenText(session)
      commit(session, {
        _tag: "turnEnd",
        id: genId("m"),
        stopReason: normalizeStop(res.stopReason),
        createdAt: now(),
      })
    } catch (error) {
      closeOpenText(session)
      commit(session, {
        _tag: "error",
        id: genId("m"),
        message: error instanceof Error ? error.message : String(error),
        createdAt: now(),
      })
    } finally {
      session.turnActive = false
      emit(session, { t: "busy", busy: false })
    }
  }

  const maybeSendInitialPrompt = (session: AcpSession) => {
    if (session.initialPromptSent) return
    const prompt = session.chat.initialPrompt
    if (prompt.trim().length === 0) return
    if (session.chat.messages.some((m) => m._tag === "user")) return
    session.initialPromptSent = true
    session.chat = { ...session.chat, initialPrompt: "" }
    flush(session)
    void runTurn(session, prompt)
  }

  const sendPrompt = async (session: AcpSession, text: string) => {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    const ready = await ensureConnected(session)
    if (!ready) {
      emit(session, {
        t: "error",
        message: session.connectError ?? "the agent is not available",
      })
      return
    }
    await runTurn(session, trimmed)
  }

  const wireClient = (session: AcpSession, ws: WebSocket) => {
    ws.on("message", (raw: unknown) => {
      let msg: {
        prompt?: { text?: string }
        cancel?: boolean
        permission?: {
          requestId?: string
          optionId?: string
          cancelled?: boolean
        }
      }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg.prompt && typeof msg.prompt.text === "string") {
        void sendPrompt(session, msg.prompt.text)
      } else if (msg.cancel === true) {
        cancelTurn(session)
      } else if (
        msg.permission &&
        typeof msg.permission.requestId === "string"
      ) {
        respondPermission(
          session,
          msg.permission.requestId,
          msg.permission.cancelled === true
            ? null
            : (msg.permission.optionId ?? null)
        )
      }
    })
    ws.on("close", () => {
      // Detach but keep the session (and its agent) alive for a reconnect.
      if (session.client === ws) session.client = null
    })
  }

  const cancelTurn = (session: AcpSession) => {
    cancelPendingPermissions(session)
    if (
      session.conn !== null &&
      session.chat.agentSessionId !== null &&
      session.turnActive
    ) {
      void session.conn.cancel(session.chat.agentSessionId)
    }
  }

  const attach: AcpSessionManager["attach"] = (chatId, ws) => {
    let session = sessions.get(chatId)
    if (session === undefined) {
      const loaded = deps.loadChat(chatId)
      if (loaded === null) {
        send(ws, { t: "error", message: "chat not found" })
        ws.close()
        return
      }
      session = {
        chatId,
        repoPath: loaded.repoPath,
        chat: loaded.chat,
        conn: null,
        loadSupported: false,
        loading: false,
        connecting: null,
        connectError: null,
        initialPromptSent: false,
        turnActive: false,
        client: null,
        openAgentId: null,
        openThoughtId: null,
        pendingPermissions: new Map(),
      }
      sessions.set(chatId, session)
    }

    session.client = ws
    send(ws, { t: "snapshot", messages: session.chat.messages })
    send(ws, { t: "busy", busy: session.turnActive })
    send(ws, {
      t: "status",
      state: session.conn !== null ? "ready" : "connecting",
      detail: session.connectError ?? undefined,
    })
    wireClient(session, ws)
    void ensureConnected(session)
  }

  const cancel: AcpSessionManager["cancel"] = (chatId) => {
    const session = sessions.get(chatId)
    if (session !== undefined) cancelTurn(session)
  }

  const kill: AcpSessionManager["kill"] = (chatId) => {
    const session = sessions.get(chatId)
    if (session === undefined) return
    cancelPendingPermissions(session)
    session.conn?.kill()
    sessions.delete(chatId)
  }

  const isBusy: AcpSessionManager["isBusy"] = (chatId) =>
    sessions.get(chatId)?.turnActive ?? false

  return { attach, cancel, kill, isBusy }
}
