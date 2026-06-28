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
import { createRequire } from "node:module"
import type { IncomingMessage, Server } from "node:http"
import type { Duplex } from "node:stream"
import type { IPty } from "node-pty"
import type * as NodePtyModule from "node-pty"
import { WebSocketServer, type WebSocket } from "ws"
import {
  AGENT_KINDS,
  agentPtyProgram,
  type PtyProgram,
} from "../../features/threads/agents.ts"
import type { AgentKind } from "../../features/threads/schema/threads.schema.model.ts"
import { getCurrentRepo } from "../workspace/current-repo.ts"

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

const startSession = (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url ?? "", "http://localhost")
  const agent = parseAgent(url.searchParams.get("agent"))
  const cols = Number(url.searchParams.get("cols")) || 80
  const rows = Number(url.searchParams.get("rows")) || 24
  const cwd = getCurrentRepo() ?? process.cwd()
  const program: PtyProgram = agentPtyProgram(agent)

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
      env: { ...process.env, TERM: "xterm-256color" },
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

  pty.onData((data) => send(ws, { d: data }))
  pty.onExit(({ exitCode }) => {
    send(ws, { exit: exitCode })
    ws.close()
  })

  ws.on("message", (raw) => {
    let msg: { d?: string; r?: { cols: number; rows: number } }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof msg.d === "string") pty.write(msg.d)
    else if (msg.r) {
      const c = Math.max(1, Math.floor(msg.r.cols))
      const r = Math.max(1, Math.floor(msg.r.rows))
      try {
        pty.resize(c, r)
      } catch {
        // window can race the process exit — ignore a resize on a dead pty
      }
    }
  })

  ws.on("close", () => {
    try {
      pty.kill()
    } catch {
      // already gone
    }
  })
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
