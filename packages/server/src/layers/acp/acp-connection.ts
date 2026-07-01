/**
 * The ACP connection seam. `AcpConnection` is the minimal client-side surface the
 * session manager drives (initialize / new-or-load session / prompt / cancel /
 * kill); `spawnAcpConnection` is the production `ConnectFn` that spawns the
 * agent's ACP server as a subprocess, bridges its Node stdio to the SDK's Web
 * streams, and wraps `ClientSideConnection`. The manager is parameterised over a
 * `ConnectFn` so tests inject a scripted fake instead of a real agent — the ACP
 * analogue of terminal-exec's `memoryLayer` and dev-process-manager's injected
 * `spawn`.
 */
import { spawn } from "node:child_process"
import { Readable, Writable } from "node:stream"
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type ContentBlock,
  type InitializeResponse,
  type PromptResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@zed-industries/agent-client-protocol"
import { acpLaunch } from "../../features/chats/agents.ts"
import type { ChatAgent } from "../../features/chats/schema/chats.schema.model.ts"

/** The subset of the ACP `Client` interface the manager implements. */
export interface AcpClientHandlers {
  sessionUpdate: (p: SessionNotification) => Promise<void>
  requestPermission: (
    p: RequestPermissionRequest
  ) => Promise<RequestPermissionResponse>
  readTextFile: (p: ReadTextFileRequest) => Promise<ReadTextFileResponse>
  writeTextFile: (p: WriteTextFileRequest) => Promise<WriteTextFileResponse>
}

/** What the manager needs from a live agent connection. */
export interface AcpConnection {
  initialize: () => Promise<InitializeResponse>
  newSession: (cwd: string) => Promise<{ sessionId: string }>
  loadSession: (sessionId: string, cwd: string) => Promise<void>
  prompt: (sessionId: string, blocks: ContentBlock[]) => Promise<PromptResponse>
  cancel: (sessionId: string) => Promise<void>
  /** Best-effort tail of the agent's stderr, for spawn/crash diagnostics. */
  stderr: () => string
  kill: () => void
}

export interface ConnectExit {
  readonly code: number | null
  readonly error?: string
}

export type ConnectFn = (
  agent: ChatAgent,
  cwd: string,
  handlers: AcpClientHandlers,
  onExit: (exit: ConnectExit) => void
) => AcpConnection

/** Production `ConnectFn`: spawn the agent's ACP server and speak ACP to it. */
export const spawnAcpConnection: ConnectFn = (agent, cwd, handlers, onExit) => {
  const spec = acpLaunch(agent)
  const child = spawn(spec.file, [...spec.args], {
    cwd,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  })

  let stderrTail = ""
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-4000)
  })

  let exited = false
  const fireExit = (exit: ConnectExit) => {
    if (exited) return
    exited = true
    onExit(exit)
  }
  child.on("exit", (code) =>
    fireExit({ code, error: stderrTail.trim() || undefined })
  )
  child.on("error", (err) => fireExit({ code: null, error: err.message }))

  // The SDK frames newline-delimited JSON over Web streams; child_process gives
  // Node streams, so bridge them with node:stream's `toWeb`.
  // `toWeb` yields a Web stream whose chunk type carries `ArrayBufferLike`;
  // ndJsonStream wants the `ArrayBuffer`-specialised `Uint8Array`. They only
  // differ in that buffer parameter, so a direct assertion bridges them.
  const stream = ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
  )
  const conn = new ClientSideConnection(() => handlers, stream)

  return {
    initialize: () =>
      conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
      }),
    newSession: async (sessionCwd) => {
      const res = await conn.newSession({ cwd: sessionCwd, mcpServers: [] })
      return { sessionId: res.sessionId }
    },
    loadSession: async (sessionId, sessionCwd) => {
      await conn.loadSession({ sessionId, cwd: sessionCwd, mcpServers: [] })
    },
    prompt: (sessionId, blocks) => conn.prompt({ sessionId, prompt: blocks }),
    cancel: (sessionId) => conn.cancel({ sessionId }),
    stderr: () => stderrTail,
    kill: () => {
      try {
        child.kill()
      } catch {
        // already gone
      }
    },
  }
}
