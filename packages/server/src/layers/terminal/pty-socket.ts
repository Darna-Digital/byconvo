/**
 * Live terminal sessions over WebSocket. Each connection to `/api/threads/pty`
 * spawns a real PTY (node-pty) running the thread's program — the login shell for
 * a plain terminal, or an agent CLI (Claude Code / opencode / Codex) in its
 * normal interactive mode — scoped to the currently selected repository. This is
 * the byconvo (web) equivalent of embedding a terminal like libghostty: the
 * frontend renders an xterm.js terminal and streams bytes both ways.
 *
 * It is attached straight onto the Node HTTP server's `upgrade` event rather than
 * going through the Effect HttpApi, since a PTY is a long-lived bidirectional
 * stream, not a request/response.
 *
 * Wire protocol — JSON text frames both directions:
 *   client → server: { d: string }           // keystrokes / input
 *                     { r: { cols, rows } }   // resize
 *   server → client: { d: string }            // terminal output
 *                     { exit: number }         // process exited (then close)
 *                     { error: string }        // could not start the program
 */
import { randomUUID } from "node:crypto"
import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import type { IncomingMessage, Server } from "node:http"
import { dirname, join } from "node:path"
import type { Duplex } from "node:stream"
import type { IPty } from "node-pty"
import type * as NodePtyModule from "node-pty"
import { WebSocketServer, type WebSocket } from "ws"
import {
  AGENT_KINDS,
  agentPtyProgram,
  agentSessionArgs,
  type PtyProgram,
} from "../../features/threads/agents.ts"
import type { AgentKind } from "../../features/threads/schema/threads.schema.model.ts"
import { getCurrentRepo } from "../workspace/current-repo.ts"
import { recentAgentSessions } from "./agent-session-capture.ts"
import { DEV_PTY_PATH, startDevSession } from "./dev-process-manager.ts"

const PTY_PATH = "/api/threads/pty"

// node-pty is a native module. Load it lazily and tolerate failure so the
// server always boots even where the binary is missing or ABI-incompatible
// (e.g. a packaged Electron build before it has been rebuilt for Electron's
// Node ABI). Terminals then degrade to a clear error instead of crashing the
// whole server. createRequire works both under tsx (ESM) and in the esbuild
// CJS bundle, where node-pty is kept external.
type NodePty = typeof NodePtyModule
// In the esbuild CJS bundle a real `require` exists (and `import.meta.url` is
// undefined); under tsx/ESM it's the reverse. Pick whichever is available.
const requireFn: NodeRequire =
  typeof require !== "undefined" ? require : createRequire(import.meta.url)
let ptyModule: NodePty | null | undefined

/**
 * On macOS/Linux node-pty `posix_spawn`s a bundled `spawn-helper` binary as the
 * launcher for *every* PTY. When the package is installed by pnpm the prebuilt
 * helper can arrive without its executable bit (pnpm's content-addressable store
 * does not preserve file modes), and then every spawn fails with the opaque
 * "posix_spawnp failed." — no terminal, no agent, server otherwise healthy.
 * Restore +x defensively each time we load node-pty so a fresh `pnpm install`
 * can never silently break live terminals. Best-effort: a read-only/packaged
 * install just keeps whatever perms shipped (there the helper is already +x).
 */
const ensureSpawnHelperExecutable = (moduleEntry: string): void => {
  if (process.platform === "win32") return
  // Climb from the resolved entry (…/node-pty/lib/index.js) to the package root.
  let root = dirname(moduleEntry)
  for (let i = 0; i < 6 && !existsSync(join(root, "package.json")); i++) {
    const parent = dirname(root)
    if (parent === root) break
    root = parent
  }
  const helpers = [
    join(root, "build", "Release", "spawn-helper"),
    join(
      root,
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper"
    ),
  ]
  for (const helper of helpers) {
    try {
      if (!existsSync(helper)) continue
      const mode = statSync(helper).mode
      if ((mode & 0o111) !== 0o111) chmodSync(helper, mode | 0o111)
    } catch {
      // best-effort; ignore (e.g. a read-only filesystem)
    }
  }
}

const loadNodePty = (): NodePty | null => {
  if (ptyModule !== undefined) return ptyModule
  // The desktop main process passes the exact node-pty location it resolved
  // (only in the packaged path, where the server shares Electron's Node ABI), so
  // resolution doesn't depend on walking up through the asar. Fall back to a
  // bare specifier for dev / standalone, where node-pty is in node_modules.
  const candidates = [process.env["BYCONVO_NODE_PTY"], "node-pty"].filter(
    (c): c is string => typeof c === "string" && c.length > 0
  )
  for (const candidate of candidates) {
    try {
      ptyModule = requireFn(candidate) as NodePty
      try {
        ensureSpawnHelperExecutable(requireFn.resolve(candidate))
      } catch {
        // resolution is best-effort; the module already loaded
      }
      return ptyModule
    } catch {
      // try the next candidate
    }
  }
  ptyModule = null
  return ptyModule
}

const parseAgent = (value: string | null): AgentKind =>
  value !== null && (AGENT_KINDS as ReadonlyArray<string>).includes(value)
    ? (value as AgentKind)
    : "terminal"

const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

/**
 * A live PTY kept alive independently of any one WebSocket. The browser tab can
 * close or reload (window closed and reopened, HMR, etc.) and the process keeps
 * running on the server; the next connection for the same thread id re-attaches
 * and gets the recent scrollback replayed so the screen is restored. Sessions
 * are keyed by thread id and only torn down when the process exits or the thread
 * is deleted (killSession). Without a thread id (shouldn't happen from the SPA)
 * we fall back to an ephemeral session that dies with its socket.
 */
interface PtySession {
  readonly pty: IPty
  /** Recent raw output, capped, replayed verbatim to a re-attaching client. */
  chunks: string[]
  size: number
  /** The currently attached socket, or null while detached (window closed). */
  client: WebSocket | null
  exited: boolean
  /** Poller discovering an opencode/codex native session id, or null. */
  captureTimer: ReturnType<typeof setInterval> | null
}

const sessions = new Map<string, PtySession>()
// Cap the replay buffer per session. A full-screen agent TUI repaints itself, so
// the last slice is enough to reconstruct the screen on re-attach.
const BUFFER_CAP = 256_000

const appendChunk = (session: PtySession, data: string) => {
  session.chunks.push(data)
  session.size += data.length
  while (session.size > BUFFER_CAP && session.chunks.length > 1) {
    const dropped = session.chunks.shift()
    if (dropped !== undefined) session.size -= dropped.length
  }
}

/** Kill and forget a session — called when its thread is deleted. */
export const killPtySession = (id: string): void => {
  const session = sessions.get(id)
  if (session === undefined) return
  sessions.delete(id)
  if (session.captureTimer !== null) clearInterval(session.captureTimer)
  try {
    session.pty.kill()
  } catch {
    // already gone
  }
}

/**
 * Environment a session's program inherits. Exposes the thread id and the local
 * API origin so an agent CLI can always look up its own thread / linked task
 * (GET /api/threads/{id}, GET /api/tasks/resolve/{ref}); the linked task at spawn
 * time is also passed directly for convenience.
 */
/** The one-shot initial prompt stored on a thread, or "" if none. */
const readThreadInitialPrompt = (repoPath: string, id: string): string => {
  try {
    const raw = JSON.parse(
      readFileSync(`${repoPath}/.byconvo/threads.json`, "utf8")
    )
    if (!Array.isArray(raw)) return ""
    const thread = raw.find(
      (t) => t !== null && typeof t === "object" && t.id === id
    )
    return thread !== undefined && typeof thread.initialPrompt === "string"
      ? thread.initialPrompt
      : ""
  } catch {
    return ""
  }
}

/** Clear a thread's initial prompt after it has been delivered (best-effort). */
const clearThreadInitialPrompt = (repoPath: string, id: string): void => {
  try {
    const path = `${repoPath}/.byconvo/threads.json`
    const raw = JSON.parse(readFileSync(path, "utf8"))
    if (!Array.isArray(raw)) return
    let changed = false
    const next = raw.map((t) => {
      if (
        t !== null &&
        typeof t === "object" &&
        t.id === id &&
        t.initialPrompt
      ) {
        changed = true
        return { ...t, initialPrompt: "" }
      }
      return t
    })
    if (changed) writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // best-effort
  }
}

/** The agent's stored native session id for a thread, or null if none yet. */
const readThreadAgentSessionId = (
  repoPath: string,
  id: string
): string | null => {
  try {
    const raw = JSON.parse(
      readFileSync(`${repoPath}/.byconvo/threads.json`, "utf8")
    )
    if (!Array.isArray(raw)) return null
    const thread = raw.find(
      (t) => t !== null && typeof t === "object" && t.id === id
    )
    return thread !== undefined && typeof thread.agentSessionId === "string"
      ? thread.agentSessionId
      : null
  } catch {
    return null
  }
}

/** Merge `patch` into a thread record on disk, preserving all other fields. */
const patchThread = (
  repoPath: string,
  id: string,
  patch: Record<string, unknown>
): void => {
  try {
    const path = `${repoPath}/.byconvo/threads.json`
    const raw = JSON.parse(readFileSync(path, "utf8"))
    if (!Array.isArray(raw)) return
    let changed = false
    const next = raw.map((t) => {
      if (t !== null && typeof t === "object" && t.id === id) {
        changed = true
        return { ...t, ...patch }
      }
      return t
    })
    if (changed) writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // best-effort
  }
}

// Poll for the native session id opencode/codex minted, then persist it so the
// thread can be resumed after this process dies. Sessions may only appear once
// the user sends a first message, so we keep checking for a while.
const CAPTURE_INTERVAL_MS = 3000
const CAPTURE_MAX_MS = 30 * 60_000

const startSessionCapture = (
  session: PtySession,
  agent: "opencode" | "codex",
  cwd: string,
  id: string
): void => {
  const since = Date.now() - 2000 // small skew for fs mtime granularity
  const deadline = Date.now() + CAPTURE_MAX_MS
  const stop = () => {
    if (session.captureTimer !== null) {
      clearInterval(session.captureTimer)
      session.captureTimer = null
    }
  }
  session.captureTimer = setInterval(() => {
    if (session.exited || Date.now() > deadline) return stop()
    let found: ReturnType<typeof recentAgentSessions>
    try {
      found = recentAgentSessions(agent, cwd, since)
    } catch {
      found = []
    }
    if (found.length > 0) {
      // Newest matching session is the one this launch created.
      const newest = found.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a))
      patchThread(cwd, id, { agentSessionId: newest.id })
      stop()
    }
  }, CAPTURE_INTERVAL_MS)
}

const buildSessionEnv = (
  repoPath: string,
  threadId: string
): Record<string, string> => {
  const env: Record<string, string> = {
    BYCONVO_THREAD_ID: threadId,
    BYCONVO_API: `http://localhost:${process.env["BYCONVO_PORT"] ?? 41811}`,
  }
  const readJson = (path: string): unknown => {
    try {
      return JSON.parse(readFileSync(path, "utf8"))
    } catch {
      return undefined
    }
  }
  const threads = readJson(`${repoPath}/.byconvo/threads.json`)
  const thread = Array.isArray(threads)
    ? (threads.find(
        (t): t is { id: string; taskKey?: unknown } =>
          typeof t === "object" &&
          t !== null &&
          (t as { id?: string }).id === threadId
      ) ?? undefined)
    : undefined
  const taskKey =
    thread !== undefined && typeof thread.taskKey === "string"
      ? thread.taskKey
      : null
  if (taskKey === null) return env

  env["BYCONVO_TASK_KEY"] = taskKey
  const board = readJson(`${repoPath}/.byconvo/tasks.json`) as
    | { cards?: ReadonlyArray<Record<string, unknown>> }
    | undefined
  const card = board?.cards?.find((c) => c["key"] === taskKey)
  if (card !== undefined) {
    const title = typeof card["title"] === "string" ? card["title"] : ""
    const desc =
      typeof card["description"] === "string" ? card["description"] : ""
    if (title.length > 0) env["BYCONVO_TASK_TITLE"] = title
    env["BYCONVO_TASK"] =
      `${taskKey} ${title}${desc.length > 0 ? ` — ${desc}` : ""}`.trim()
  }
  return env
}

/** Wire a client socket to a session: replay scrollback, then stream both ways. */
const attachClient = (
  session: PtySession,
  ws: WebSocket,
  cols: number,
  rows: number
) => {
  session.client = ws
  // Replay the buffer so a re-attaching terminal shows the prior screen.
  const backlog = session.chunks.join("")
  if (backlog.length > 0) send(ws, { d: backlog })
  // Size the PTY to the (re)attached client.
  try {
    session.pty.resize(Math.max(1, cols), Math.max(1, rows))
  } catch {
    // racing exit
  }

  ws.on("message", (raw) => {
    let msg: { d?: string; r?: { cols: number; rows: number } }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof msg.d === "string") session.pty.write(msg.d)
    else if (msg.r) {
      try {
        session.pty.resize(
          Math.max(1, Math.floor(msg.r.cols)),
          Math.max(1, Math.floor(msg.r.rows))
        )
      } catch {
        // window can race the process exit — ignore a resize on a dead pty
      }
    }
  })

  ws.on("close", () => {
    // Detach but keep the PTY alive so the session survives a reload/reopen.
    // (An ephemeral, id-less session is killed instead — see startSession.)
    if (session.client === ws) session.client = null
  })
}

const startSession = (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url ?? "", "http://localhost")
  const id = url.searchParams.get("id")
  const agent = parseAgent(url.searchParams.get("agent"))
  const cols = Number(url.searchParams.get("cols")) || 80
  const rows = Number(url.searchParams.get("rows")) || 24

  // Re-attach to a live session for this thread instead of spawning a new one.
  if (id !== null && id.length > 0) {
    const existing = sessions.get(id)
    if (existing !== undefined && !existing.exited) {
      attachClient(existing, ws, cols, rows)
      return
    }
  }

  const cwd = getCurrentRepo() ?? process.cwd()
  // A one-shot prompt to type into the program once it's ready (e.g. a task
  // comment handed to an agent). Only on a fresh spawn, never on re-attach.
  const initialPrompt =
    id !== null && id.length > 0 ? readThreadInitialPrompt(cwd, id) : ""

  // Resolve native session resume so the agent's conversation survives this PTY
  // dying (server restart / app reopen). We only reach here on a fresh spawn —
  // a live re-attach returned above.
  let sessionArgs = ""
  let captureAgent: "opencode" | "codex" | null = null
  if (id !== null && id.length > 0 && agent !== "terminal") {
    const stored = readThreadAgentSessionId(cwd, id)
    if (stored !== null) {
      // Resume the session we already know about.
      sessionArgs = agentSessionArgs(agent, { sessionId: stored, resume: true })
    } else if (agent === "claude") {
      // Claude lets us choose the id: create it now, persist it, resume later.
      const uuid = randomUUID()
      sessionArgs = agentSessionArgs(agent, { sessionId: uuid, resume: false })
      patchThread(cwd, id, { agentSessionId: uuid })
    } else {
      // opencode/codex mint their own id — start fresh, capture it afterwards.
      captureAgent = agent
    }
  }
  const program: PtyProgram = agentPtyProgram(agent, sessionArgs)

  const nodePty = loadNodePty()
  if (nodePty === null) {
    send(ws, {
      error:
        "live terminals are unavailable in this build (the node-pty native module could not be loaded)",
    })
    ws.close()
    return
  }

  let pty: IPty
  try {
    pty = nodePty.spawn(program.file, [...program.args], {
      name: "xterm-color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        ...(id !== null && id.length > 0 ? buildSessionEnv(cwd, id) : {}),
      },
    })
  } catch (error) {
    send(ws, {
      error: `could not start ${program.file} — is it installed and on your PATH? (${
        error instanceof Error ? error.message : String(error)
      })`,
    })
    ws.close()
    return
  }

  const session: PtySession = {
    pty,
    chunks: [],
    size: 0,
    client: ws,
    exited: false,
    captureTimer: null,
  }
  const persistent = id !== null && id.length > 0
  if (persistent) sessions.set(id, session)

  // For opencode/codex we couldn't preset the session id, so discover the one
  // the CLI just minted and persist it for next time.
  if (persistent && id !== null && captureAgent !== null) {
    startSessionCapture(session, captureAgent, cwd, id)
  }

  // Deliver the initial prompt once the program's output settles (it has booted
  // and is idle waiting for input), with a hard cap as a fallback. Sent once,
  // then cleared from disk so a reload/respawn never re-sends it.
  let promptDone = initialPrompt.length === 0
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let capTimer: ReturnType<typeof setTimeout> | null = null
  const flushPrompt = () => {
    if (promptDone) return
    promptDone = true
    if (settleTimer) clearTimeout(settleTimer)
    if (capTimer) clearTimeout(capTimer)
    // Collapse to a single line: some agent TUIs (e.g. Claude Code) treat an
    // embedded newline in typed input as a submit, which would fire the prompt
    // prematurely (or not at all). Codex tolerates either, so one line is safe.
    const oneLine = initialPrompt.replace(/\s*\n+\s*/g, " ").trim()
    try {
      pty.write(oneLine)
    } catch {
      // pty already gone
    }
    // Send Enter as a separate, slightly-delayed keystroke so the TUI registers
    // it as a discrete submit — a combined text+Enter write can be read as a
    // paste and left sitting in the input (this is what kept Claude from
    // auto-starting).
    setTimeout(() => {
      try {
        pty.write("\r")
      } catch {
        // pty already gone
      }
    }, 350)
    if (persistent && id !== null) clearThreadInitialPrompt(cwd, id)
  }
  // Claude Code can take several seconds to become input-ready on first launch.
  if (!promptDone) capTimer = setTimeout(flushPrompt, 8000)

  // One persistent data subscription per PTY: buffer everything, forward to
  // whichever client is currently attached (if any).
  pty.onData((data) => {
    appendChunk(session, data)
    if (session.client !== null) send(session.client, { d: data })
    if (!promptDone) {
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(flushPrompt, 900)
    }
  })
  pty.onExit(({ exitCode }) => {
    promptDone = true
    if (settleTimer) clearTimeout(settleTimer)
    if (capTimer) clearTimeout(capTimer)
    if (session.captureTimer !== null) {
      clearInterval(session.captureTimer)
      session.captureTimer = null
    }
    session.exited = true
    if (persistent && id !== null) sessions.delete(id)
    if (session.client !== null) {
      send(session.client, { exit: exitCode })
      session.client.close()
    }
  })

  attachClient(session, ws, cols, rows)

  // An id-less (ephemeral) session has no persistence value — kill it with its
  // socket so it doesn't leak.
  if (!persistent) {
    ws.on("close", () => {
      try {
        pty.kill()
      } catch {
        // already gone
      }
    })
  }
}

type UpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => void

/**
 * Attach the PTY WebSocket server to an existing Node HTTP server, routing only
 * `/api/threads/pty` upgrades to it.
 *
 * Effect's NodeHttpServer also registers an `upgrade` listener (it turns
 * upgrades into router requests, which 404 our path and corrupt the WS
 * handshake), and Node invokes *every* `upgrade` listener — so a second listener
 * beside it isn't enough, and snapshotting is racy because Effect registers its
 * listener after the server is built. Instead we make our dispatcher the only
 * real `upgrade` listener and intercept the registration methods so any later
 * `upgrade` listener (Effect's) is captured as a delegate we call for non-PTY
 * paths. attachPtyServer runs before Effect touches the server, so it wins.
 */
export const attachPtyServer = (server: Server): void => {
  const wss = new WebSocketServer({ noServer: true })
  const delegates: UpgradeListener[] = []

  const dispatcher: UpgradeListener = (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "", "http://localhost")
    if (pathname === PTY_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) =>
        startSession(ws, request)
      )
      return
    }
    // Local Dev processes share the same upgrade dispatcher; they attach to a
    // process the DevProcessManager already owns (started via REST), keyed by id.
    if (pathname === DEV_PTY_PATH) {
      wss.handleUpgrade(request, socket, head, (ws) =>
        startDevSession(ws, request)
      )
      return
    }
    for (const delegate of delegates)
      delegate.call(server, request, socket, head)
  }
  server.on("upgrade", dispatcher)

  // Redirect any other `upgrade` registration into our delegate list so our
  // dispatcher stays the sole listener and controls routing.
  const add = server.on.bind(server)
  const reroute =
    (push: (l: UpgradeListener) => void) =>
    (event: string, listener: (...args: never[]) => void): Server => {
      if (event === "upgrade" && listener !== dispatcher) {
        push(listener as UpgradeListener)
        return server
      }
      return add(event, listener as never)
    }
  server.on = reroute((l) => delegates.push(l)) as Server["on"]
  server.addListener = server.on
  server.prependListener = reroute((l) =>
    delegates.unshift(l)
  ) as Server["prependListener"]
}
