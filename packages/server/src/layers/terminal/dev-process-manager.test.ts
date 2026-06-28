import type { WebSocket } from "ws"
import { describe, expect, it, vi } from "vitest"
import {
  createDevProcessManager,
  type PtyLike,
  type SpawnFn,
} from "./dev-process-manager.ts"

/** A controllable fake PTY: capture the data/exit callbacks so a test can emit. */
const makeFakePty = () => {
  let dataCb: (data: string) => void = () => {}
  let exitCb: (event: { exitCode: number }) => void = () => {}
  const pty = {
    onData: (cb: (data: string) => void) => {
      dataCb = cb
    },
    onExit: (cb: (event: { exitCode: number }) => void) => {
      exitCb = cb
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  } satisfies PtyLike
  return {
    pty,
    emit: (data: string) => dataCb(data),
    exit: (code: number) => exitCb({ exitCode: code }),
  }
}

/** A fake WebSocket capturing sent frames and registered handlers. */
const makeFakeWs = () => {
  const sent: unknown[] = []
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (raw: string) => sent.push(JSON.parse(raw)),
    close: vi.fn(),
    on: (event: string, cb: (arg?: unknown) => void) => {
      handlers[event] = cb
    },
  }
  return {
    ws: ws as unknown as WebSocket,
    sent,
    message: (msg: unknown) =>
      handlers["message"]?.(Buffer.from(JSON.stringify(msg))),
    fireClose: () => handlers["close"]?.(),
  }
}

describe("DevProcessManager", () => {
  it("spawns through a login shell in the repo and reports running", () => {
    const calls: Array<{
      file: string
      args: ReadonlyArray<string>
      cwd: string
    }> = []
    const spawn: SpawnFn = (file, args, opts) => {
      calls.push({ file, args, cwd: opts.cwd })
      return makeFakePty().pty
    }
    const m = createDevProcessManager({ spawn })

    const status = m.start({
      commandId: "c1",
      repoPath: "/repo",
      command: "pnpm dev",
    })

    expect(status.status).toBe("running")
    expect(calls).toHaveLength(1)
    expect(calls[0].cwd).toBe("/repo")
    expect(calls[0].args).toEqual(["-l", "-i", "-c", "pnpm dev"])
  })

  it("buffers output and replays scrollback to an attaching viewer", () => {
    const fake = makeFakePty()
    const m = createDevProcessManager({ spawn: () => fake.pty })
    m.start({ commandId: "c1", repoPath: "/repo", command: "x" })

    fake.emit("before-attach\n")
    const viewer = makeFakeWs()
    expect(m.attach("c1", viewer.ws, 80, 24)).toBe(true)
    expect(viewer.sent).toContainEqual({ d: "before-attach\n" })

    fake.emit("live\n")
    expect(viewer.sent).toContainEqual({ d: "live\n" })
  })

  it("detaching a viewer keeps the process alive; stop kills it", () => {
    const fake = makeFakePty()
    const m = createDevProcessManager({ spawn: () => fake.pty })
    m.start({ commandId: "c1", repoPath: "/repo", command: "x" })
    const viewer = makeFakeWs()
    m.attach("c1", viewer.ws, 80, 24)

    viewer.fireClose()
    expect(fake.pty.kill).not.toHaveBeenCalled()
    expect(m.get("c1")?.status).toBe("running")

    m.stop("c1")
    expect(fake.pty.kill).toHaveBeenCalledTimes(1)
  })

  it("marks a process exited, retains output, and replays it on re-attach", () => {
    const fake = makeFakePty()
    const m = createDevProcessManager({ spawn: () => fake.pty })
    m.start({ commandId: "c1", repoPath: "/repo", command: "x" })

    fake.emit("done\n")
    fake.exit(0)
    expect(m.get("c1")?.status).toBe("exited")
    expect(m.get("c1")?.exitCode).toBe(0)

    const viewer = makeFakeWs()
    expect(m.attach("c1", viewer.ws, 80, 24)).toBe(true)
    expect(viewer.sent).toContainEqual({ d: "done\n" })
    expect(viewer.sent).toContainEqual({ exit: 0 })
  })

  it("forwards client keystrokes and resize to the pty", () => {
    const fake = makeFakePty()
    const m = createDevProcessManager({ spawn: () => fake.pty })
    m.start({ commandId: "c1", repoPath: "/repo", command: "x" })
    const viewer = makeFakeWs()
    m.attach("c1", viewer.ws, 80, 24)

    viewer.message({ d: "ls\r" })
    expect(fake.pty.write).toHaveBeenCalledWith("ls\r")

    viewer.message({ r: { cols: 100, rows: 30 } })
    expect(fake.pty.resize).toHaveBeenLastCalledWith(100, 30)
  })

  it("restarting a running command kills the previous process", () => {
    const first = makeFakePty()
    const second = makeFakePty()
    const ptys = [first.pty, second.pty]
    let index = 0
    const m = createDevProcessManager({ spawn: () => ptys[index++] })

    m.start({ commandId: "c1", repoPath: "/r", command: "x" })
    m.start({ commandId: "c1", repoPath: "/r", command: "x" })

    expect(first.pty.kill).toHaveBeenCalledTimes(1)
    expect(second.pty.kill).not.toHaveBeenCalled()
  })

  it("stopRepo stops and forgets only the matching repo's processes", () => {
    const a = makeFakePty()
    const b = makeFakePty()
    const spawn: SpawnFn = (_file, _args, opts) =>
      opts.cwd === "/a" ? a.pty : b.pty
    const m = createDevProcessManager({ spawn })
    m.start({ commandId: "ca", repoPath: "/a", command: "x" })
    m.start({ commandId: "cb", repoPath: "/b", command: "y" })

    m.stopRepo("/a")

    expect(a.pty.kill).toHaveBeenCalledTimes(1)
    expect(b.pty.kill).not.toHaveBeenCalled()
    expect(m.get("ca")).toBeNull()
    expect(m.get("cb")?.status).toBe("running")
    expect(m.statuses("/b").map((s) => s.commandId)).toEqual(["cb"])
    expect(m.statuses("/a")).toHaveLength(0)
  })

  it("attach returns false for a command that is not running", () => {
    const m = createDevProcessManager({ spawn: () => makeFakePty().pty })
    const viewer = makeFakeWs()
    expect(m.attach("nope", viewer.ws, 80, 24)).toBe(false)
  })
})
