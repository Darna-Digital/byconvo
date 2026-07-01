import type { WebSocket } from "ws"
import { describe, expect, it, vi } from "vitest"
import {
  createAcpSessionManager,
  type PersistUpdate,
  type WsEvent,
} from "./acp-session-manager.ts"
import type { PromptResponse } from "@zed-industries/agent-client-protocol"
import type {
  AcpClientHandlers,
  AcpConnection,
  ConnectExit,
  ConnectFn,
} from "./acp-connection.ts"
import type {
  Chat,
  ChatMessage,
} from "../../features/chats/schema/chats.schema.model.ts"

const baseChat = (over: Partial<Chat> = {}): Chat => ({
  id: "c1",
  title: "Claude Code",
  agent: "claude",
  branch: "main",
  taskKey: null,
  initialPrompt: "",
  agentSessionId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [],
  ...over,
})

/** A scripted ACP connection: captures the handlers so a test can drive updates. */
const makeConn = (opts?: {
  loadSession?: boolean
  sessionId?: string
  prompt?: (h: AcpClientHandlers, sessionId: string) => Promise<PromptResponse>
}) => {
  const state: {
    handlers: AcpClientHandlers | null
    onExit: ((e: ConnectExit) => void) | null
  } = {
    handlers: null,
    onExit: null,
  }
  const cancel = vi.fn(async () => {})
  const kill = vi.fn(() => {})
  const conn: AcpConnection = {
    initialize: async () => ({
      protocolVersion: 1,
      agentCapabilities: { loadSession: opts?.loadSession ?? false },
    }),
    newSession: async () => ({ sessionId: opts?.sessionId ?? "ses-1" }),
    loadSession: async () => {},
    prompt: async (sessionId) =>
      opts?.prompt
        ? opts.prompt(state.handlers!, sessionId)
        : { stopReason: "end_turn" },
    cancel,
    stderr: () => "",
    kill,
  }
  const connect: ConnectFn = (_agent, _cwd, handlers, onExit) => {
    state.handlers = handlers
    state.onExit = onExit
    return conn
  }
  return { conn, connect, cancel, kill, state }
}

/** A fake WebSocket capturing sent frames and registered handlers. */
const makeFakeWs = () => {
  const sent: WsEvent[] = []
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (raw: string) => sent.push(JSON.parse(raw) as WsEvent),
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

const harness = (
  connectBundle: ReturnType<typeof makeConn>,
  seed: Chat = baseChat()
) => {
  const persisted: PersistUpdate[] = []
  const chat = { current: seed }
  const manager = createAcpSessionManager({
    connect: connectBundle.connect,
    loadChat: () => ({ repoPath: "/repo", chat: chat.current }),
    persist: (_id, _repo, update) => {
      persisted.push(update)
      chat.current = {
        ...chat.current,
        messages: [...update.messages],
        agentSessionId: update.agentSessionId,
      }
    },
    now: () => "2026-01-01T00:00:00.000Z",
  })
  return { manager, persisted, chat }
}

const lastPersisted = (
  persisted: PersistUpdate[]
): ReadonlyArray<ChatMessage> => persisted[persisted.length - 1]?.messages ?? []

describe("AcpSessionManager", () => {
  it("connects, mints a session id, and snapshots the client on attach", async () => {
    const bundle = makeConn({ sessionId: "ses-new" })
    const { manager, persisted } = harness(bundle)
    const viewer = makeFakeWs()

    manager.attach("c1", viewer.ws)

    expect(viewer.sent[0]).toEqual({ t: "snapshot", messages: [] })
    await vi.waitFor(() =>
      expect(persisted.some((p) => p.agentSessionId === "ses-new")).toBe(true)
    )
    await vi.waitFor(() =>
      expect(viewer.sent).toContainEqual({ t: "status", state: "ready" })
    )
  })

  it("streams a prompt turn: user message, agent text, turnEnd; busy toggles", async () => {
    const bundle = makeConn({
      prompt: async (h, sid) => {
        await h.sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Hello" },
          },
        })
        await h.sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: " world" },
          },
        })
        return { stopReason: "end_turn" }
      },
    })
    const { manager, persisted } = harness(bundle)
    const viewer = makeFakeWs()
    manager.attach("c1", viewer.ws)
    await vi.waitFor(() =>
      expect(viewer.sent).toContainEqual({ t: "status", state: "ready" })
    )

    viewer.message({ prompt: { text: "hi there" } })

    await vi.waitFor(() => {
      const tags = lastPersisted(persisted).map((m) => m._tag)
      expect(tags).toEqual(["user", "agent", "turnEnd"])
    })
    const messages = lastPersisted(persisted)
    const user = messages[0]
    const agent = messages[1]
    expect(user._tag === "user" && user.text).toBe("hi there")
    // Two chunks accumulate into one whole-block agent message.
    expect(agent._tag === "agent" && agent.text).toBe("Hello world")
    expect(viewer.sent).toContainEqual({ t: "busy", busy: true })
    expect(viewer.sent).toContainEqual({ t: "busy", busy: false })
    // The client saw a streamed delta for the second chunk.
    expect(
      viewer.sent.some((e) => e.t === "delta" && e.text === " world")
    ).toBe(true)
  })

  it("merges tool_call + tool_call_update by toolCallId", async () => {
    const bundle = makeConn({
      prompt: async (h, sid) => {
        await h.sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "t1",
            title: "Read file",
            kind: "read",
            status: "pending",
          },
        })
        await h.sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "t1",
            status: "completed",
            content: [
              { type: "content", content: { type: "text", text: "done" } },
            ],
          },
        })
        return { stopReason: "end_turn" }
      },
    })
    const { manager, persisted } = harness(bundle)
    const viewer = makeFakeWs()
    manager.attach("c1", viewer.ws)
    await vi.waitFor(() =>
      expect(viewer.sent).toContainEqual({ t: "status", state: "ready" })
    )
    viewer.message({ prompt: { text: "go" } })

    await vi.waitFor(() => {
      const tool = lastPersisted(persisted).find((m) => m._tag === "toolCall")
      expect(tool && tool._tag === "toolCall" && tool.status).toBe("completed")
    })
    const tools = lastPersisted(persisted).filter((m) => m._tag === "toolCall")
    expect(tools).toHaveLength(1) // merged, not duplicated
    const tool = tools[0]
    expect(tool._tag === "toolCall" && tool.title).toBe("Read file")
    expect(tool._tag === "toolCall" && tool.content[0]).toEqual({
      type: "text",
      text: "done",
    })
  })

  it("correlates a permission request with the client's answer", async () => {
    const bundle = makeConn({
      prompt: async (h, sid) => {
        const res = await h.requestPermission({
          sessionId: sid,
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "deny", name: "Deny", kind: "reject_once" },
          ],
          toolCall: { toolCallId: "t1", title: "Write config.json" },
        })
        // The agent only proceeds once the user answers.
        expect(res.outcome.outcome).toBe("selected")
        return { stopReason: "end_turn" }
      },
    })
    const { manager, persisted } = harness(bundle)
    const viewer = makeFakeWs()
    manager.attach("c1", viewer.ws)
    await vi.waitFor(() =>
      expect(viewer.sent).toContainEqual({ t: "status", state: "ready" })
    )
    viewer.message({ prompt: { text: "write it" } })

    // A pending permission message reaches the client.
    await vi.waitFor(() =>
      expect(
        viewer.sent.some(
          (e) => e.t === "message" && e.message._tag === "permission"
        )
      ).toBe(true)
    )
    const permEvent = viewer.sent.find(
      (e): e is Extract<WsEvent, { t: "message" }> =>
        e.t === "message" && e.message._tag === "permission"
    )!
    const requestId =
      permEvent.message._tag === "permission" ? permEvent.message.requestId : ""

    viewer.message({ permission: { requestId, optionId: "allow" } })

    await vi.waitFor(() => {
      const tags = lastPersisted(persisted).map((m) => m._tag)
      expect(tags).toContain("turnEnd")
    })
    const perm = lastPersisted(persisted).find((m) => m._tag === "permission")
    expect(perm && perm._tag === "permission" && perm.outcome).toEqual({
      outcome: "selected",
      optionId: "allow",
    })
  })

  it("snapshots the full transcript to a reconnecting viewer", async () => {
    const bundle = makeConn({
      prompt: async (h, sid) => {
        await h.sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "done" },
          },
        })
        return { stopReason: "end_turn" }
      },
    })
    const { manager } = harness(bundle)
    const first = makeFakeWs()
    manager.attach("c1", first.ws)
    await vi.waitFor(() =>
      expect(first.sent).toContainEqual({ t: "status", state: "ready" })
    )
    first.message({ prompt: { text: "hi" } })
    await vi.waitFor(() =>
      expect(
        first.sent.some(
          (e) => e.t === "message" && e.message._tag === "turnEnd"
        )
      ).toBe(true)
    )
    first.fireClose()

    const second = makeFakeWs()
    manager.attach("c1", second.ws)
    const snap = second.sent[0]
    expect(snap.t).toBe("snapshot")
    expect(snap.t === "snapshot" && snap.messages.map((m) => m._tag)).toEqual([
      "user",
      "agent",
      "turnEnd",
    ])
  })

  it("cancel forwards to the agent connection", async () => {
    const deferred: { resolve: (r: PromptResponse) => void } = {
      resolve: () => {},
    }
    const bundle = makeConn({
      prompt: () =>
        new Promise<PromptResponse>((resolve) => {
          deferred.resolve = resolve
        }),
    })
    const { manager } = harness(bundle)
    const viewer = makeFakeWs()
    manager.attach("c1", viewer.ws)
    await vi.waitFor(() =>
      expect(viewer.sent).toContainEqual({ t: "status", state: "ready" })
    )
    viewer.message({ prompt: { text: "long task" } })
    await vi.waitFor(() => expect(manager.isBusy("c1")).toBe(true))

    manager.cancel("c1")
    expect(bundle.cancel).toHaveBeenCalledWith("ses-1")
    deferred.resolve({ stopReason: "cancelled" })
  })
})
