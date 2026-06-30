/**
 * DevProcessManager — owns the long-running "Local Dev" command processes.
 *
 * Unlike a terminal thread (whose PTY the user drives interactively), a dev
 * command is a background process — a dev server, a watcher — that must keep
 * running while the user browses other pages. So the process is owned here, by a
 * module-level registry that outlives any one WebSocket: closing the browser tab
 * only *detaches* a viewer, it never kills the process. A process stops only on
 * an explicit Stop, or when the user switches to a different repository (each
 * repo owns its own running processes).
 *
 * This mirrors the persistent-session pattern proven in pty-socket.ts (a capped
 * scrollback buffer replayed to a re-attaching client), but adds what dev
 * commands need on top: repo ownership (for the stop-on-repo-switch sweep),
 * status listing (for the REST list endpoint), arbitrary commands, and starting
 * without an attached viewer (so "Run all" can launch processes headless).
 *
 * The PTY spawner is injected (`createDevProcessManager`) so the registry is
 * unit-testable with a fake pty; the production singleton wraps node-pty.
 *
 * WS wire protocol matches the terminal threads socket:
 *   client → server: { d: string } | { r: { cols, rows } }
 *   server → client: { d: string } | { exit: number } | { error: string }
 */
import type { IncomingMessage } from "node:http"
import type { WebSocket } from "ws"
import { onCurrentRepoChange } from "../workspace/current-repo.ts"
import { loadNodePty } from "./node-pty.ts"

export const DEV_PTY_PATH = "/api/local-dev/pty"

export type DevStatus = "running" | "exited"

/** Runtime status of a dev command, surfaced to the REST API. */
export interface DevRunStatus {
  readonly commandId: string
  readonly status: DevStatus
  readonly exitCode: number | null
  readonly startedAt: string
}

/** The minimal PTY surface the manager needs — satisfied by node-pty's IPty. */
export interface PtyLike {
  readonly onData: (cb: (data: string) => void) => void
  readonly onExit: (cb: (event: { exitCode: number }) => void) => void
  readonly write: (data: string) => void
  readonly resize: (cols: number, rows: number) => void
  readonly kill: () => void
}

export interface SpawnOptions {
  readonly name: string
  readonly cols: number
  readonly rows: number
  readonly cwd: string
  readonly env: Record<string, string>
}

export type SpawnFn = (
  file: string,
  args: ReadonlyArray<string>,
  opts: SpawnOptions
) => PtyLike

export interface StartInput {
  readonly commandId: string
  readonly repoPath: string
  readonly command: string
  readonly cols?: number
  readonly rows?: number
}

export interface DevProcessManager {
  /** Start (or restart) the process for a command; returns its status. */
  readonly start: (input: StartInput) => DevRunStatus
  /** Attach a viewer: replay scrollback then stream both ways. False if no such
   * process exists (the caller should tell the client it isn't running). */
  readonly attach: (
    commandId: string,
    ws: WebSocket,
    cols: number,
    rows: number
  ) => boolean
  /** Stop a running process (its output is retained as `exited`). */
  readonly stop: (commandId: string) => void
  /** Stop and forget every process owned by a repository (repo-switch sweep). */
  readonly stopRepo: (repoPath: string) => void
  /** Statuses of every process owned by a repository. */
  readonly statuses: (repoPath: string) => ReadonlyArray<DevRunStatus>
  readonly get: (commandId: string) => DevRunStatus | null
}

interface RunningProcess {
  readonly commandId: string
  readonly repoPath: string
  readonly pty: PtyLike
  /** Recent raw output, capped, replayed verbatim to a re-attaching client. */
  chunks: string[]
  size: number
  readonly clients: Set<WebSocket>
  status: DevStatus
  exitCode: number | null
  readonly startedAt: string
}

// Cap the replay buffer per process; the tail is enough to reconstruct a screen
// that a full-screen TUI repaints, and bounds memory for a chatty dev server.
const BUFFER_CAP = 256_000

const appendChunk = (proc: RunningProcess, data: string) => {
  proc.chunks.push(data)
  proc.size += data.length
  while (proc.size > BUFFER_CAP && proc.chunks.length > 1) {
    const dropped = proc.chunks.shift()
    if (dropped !== undefined) proc.size -= dropped.length
  }
}

const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
}

const statusOf = (proc: RunningProcess): DevRunStatus => ({
  commandId: proc.commandId,
  status: proc.status,
  exitCode: proc.exitCode,
  startedAt: proc.startedAt,
})

const userShell = (): string => process.env["SHELL"] ?? "bash"

/**
 * Run the command through the user's login + interactive shell so it inherits
 * the full PATH a real terminal tab has (Homebrew, version managers,
 * ~/.local/bin) — the same reason terminal threads launch agent CLIs via
 * `$SHELL -lic` (see threads/agents.ts). The command is a single argv element,
 * so the shell parses it; no extra quoting is needed.
 */
const devProgramArgs = (command: string): ReadonlyArray<string> => [
  "-l",
  "-i",
  "-c",
  command,
]

const cleanEnv = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  env["TERM"] = "xterm-256color"
  return env
}

export const createDevProcessManager = (deps: {
  spawn: SpawnFn
  now?: () => string
}): DevProcessManager => {
  const now = deps.now ?? (() => new Date().toISOString())
  const processes = new Map<string, RunningProcess>()

  const start = (input: StartInput): DevRunStatus => {
    // Restarting replaces any prior run (kill it if still alive) — a command has
    // at most one live process, like a JetBrains run configuration.
    const prev = processes.get(input.commandId)
    if (prev !== undefined && prev.status === "running") {
      try {
        prev.pty.kill()
      } catch {
        // already gone
      }
    }
    processes.delete(input.commandId)

    const pty = deps.spawn(userShell(), devProgramArgs(input.command), {
      name: "xterm-color",
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      cwd: input.repoPath,
      env: cleanEnv(),
    })
    const proc: RunningProcess = {
      commandId: input.commandId,
      repoPath: input.repoPath,
      pty,
      chunks: [],
      size: 0,
      clients: new Set(),
      status: "running",
      exitCode: null,
      startedAt: now(),
    }
    processes.set(input.commandId, proc)

    pty.onData((data) => {
      appendChunk(proc, data)
      for (const ws of proc.clients) send(ws, { d: data })
    })
    pty.onExit(({ exitCode }) => {
      proc.status = "exited"
      proc.exitCode = exitCode
      for (const ws of proc.clients) send(ws, { exit: exitCode })
    })

    return statusOf(proc)
  }

  const attach = (
    commandId: string,
    ws: WebSocket,
    cols: number,
    rows: number
  ): boolean => {
    const proc = processes.get(commandId)
    if (proc === undefined) return false

    proc.clients.add(ws)
    const backlog = proc.chunks.join("")
    if (backlog.length > 0) send(ws, { d: backlog })
    ws.on("close", () => proc.clients.delete(ws))

    // An exited process keeps its output for review; replay it and the exit
    // code, but there's nothing live to write to.
    if (proc.status === "exited") {
      send(ws, { exit: proc.exitCode ?? 0 })
      return true
    }

    try {
      proc.pty.resize(Math.max(1, cols), Math.max(1, rows))
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
      if (typeof msg.d === "string") proc.pty.write(msg.d)
      else if (msg.r) {
        try {
          proc.pty.resize(
            Math.max(1, Math.floor(msg.r.cols)),
            Math.max(1, Math.floor(msg.r.rows))
          )
        } catch {
          // window can race the process exit — ignore a resize on a dead pty
        }
      }
    })
    return true
  }

  const stop = (commandId: string): void => {
    const proc = processes.get(commandId)
    if (proc === undefined || proc.status !== "running") return
    try {
      proc.pty.kill()
    } catch {
      // already gone — onExit will still flip status
    }
  }

  const stopRepo = (repoPath: string): void => {
    for (const [id, proc] of processes) {
      if (proc.repoPath !== repoPath) continue
      if (proc.status === "running") {
        try {
          proc.pty.kill()
        } catch {
          // already gone
        }
      }
      processes.delete(id)
    }
  }

  const statuses = (repoPath: string): ReadonlyArray<DevRunStatus> =>
    [...processes.values()]
      .filter((proc) => proc.repoPath === repoPath)
      .map(statusOf)

  const get = (commandId: string): DevRunStatus | null => {
    const proc = processes.get(commandId)
    return proc === undefined ? null : statusOf(proc)
  }

  return { start, attach, stop, stopRepo, statuses, get }
}

const realSpawn: SpawnFn = (file, args, opts) => {
  const nodePty = loadNodePty()
  if (nodePty === null) {
    throw new Error(
      "live processes are unavailable in this build (the node-pty native module could not be loaded)"
    )
  }
  return nodePty.spawn(file, [...args], opts)
}

/** The production registry, shared across requests and the WebSocket handler. */
export const devProcessManager = createDevProcessManager({ spawn: realSpawn })

// Each repository owns its running processes: when the user selects a different
// repo, stop the previous repo's dev commands.
onCurrentRepoChange((_next, prev) => {
  if (prev !== null) devProcessManager.stopRepo(prev)
})

/**
 * WebSocket entry point for `/api/local-dev/pty?command=<id>`: attach the socket
 * to the already-running process for that command (the SPA opens this only for a
 * running command). Starting a process is a REST action, decoupled from viewing.
 */
export const startDevSession = (
  ws: WebSocket,
  request: IncomingMessage
): void => {
  const url = new URL(request.url ?? "", "http://localhost")
  const commandId = url.searchParams.get("command")
  const cols = Number(url.searchParams.get("cols")) || 80
  const rows = Number(url.searchParams.get("rows")) || 24
  if (commandId === null || commandId.length === 0) {
    send(ws, { error: "missing command id" })
    ws.close()
    return
  }
  if (!devProcessManager.attach(commandId, ws, cols, rows)) {
    send(ws, { error: "this command is not running — start it first" })
    ws.close()
  }
}
