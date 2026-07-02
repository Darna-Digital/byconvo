import { describe, expect, it } from "vitest"
import { createCodexTurnParser } from "./codex-stream.ts"

const line = (value: unknown) => JSON.stringify(value)

describe("createCodexTurnParser (item dialect)", () => {
  it("captures the thread id as the session", () => {
    const parser = createCodexTurnParser()
    expect(
      parser.push(line({ type: "thread.started", thread_id: "th-1" }))
    ).toEqual([{ type: "session", sessionId: "th-1" }])
  })

  it("appends completed assistant messages, separated per round", () => {
    const parser = createCodexTurnParser()
    parser.push(
      line({
        type: "item.completed",
        item: { item_type: "assistant_message", text: "First." },
      })
    )
    parser.push(
      line({
        type: "item.completed",
        item: { item_type: "assistant_message", text: "Second." },
      })
    )
    expect(parser.text()).toBe("First.\n\nSecond.")
  })

  it("captures the current `agent_message` reply keyed by `type`", () => {
    // Real shape from codex-cli 0.142.5: item.type (not item_type) is
    // "agent_message" (not "assistant_message"). Missing this drops the reply.
    const parser = createCodexTurnParser()
    const events = parser.push(
      line({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "pong" },
      })
    )
    expect(events).toEqual([{ type: "delta", text: "pong" }])
    expect(parser.text()).toBe("pong")
  })

  it("maps command execution items to tool activities", () => {
    const parser = createCodexTurnParser()
    const started = parser.push(
      line({
        type: "item.started",
        item: { item_type: "command_execution", command: "pnpm test" },
      })
    )
    expect(started).toEqual([
      {
        type: "activity",
        kind: "tool.started",
        tone: "tool",
        summary: "Command — pnpm test",
        detail: null,
      },
    ])
    const failed = parser.push(
      line({
        type: "item.completed",
        item: {
          item_type: "command_execution",
          command: "pnpm test",
          exit_code: 1,
        },
      })
    )
    expect(failed[0]).toMatchObject({ kind: "tool.failed", tone: "error" })
  })

  it("settles on turn.completed / turn.failed", () => {
    const ok = createCodexTurnParser()
    expect(ok.push(line({ type: "turn.completed", usage: {} }))).toEqual([
      {
        type: "result",
        state: "completed",
        errorMessage: null,
        totalCostUsd: null,
      },
    ])
    expect(ok.settled()).toBe(true)

    const bad = createCodexTurnParser()
    expect(
      bad.push(
        line({ type: "turn.failed", error: { message: "rate limited" } })
      )
    ).toEqual([
      {
        type: "result",
        state: "error",
        errorMessage: "rate limited",
        totalCostUsd: null,
      },
    ])
  })
})

describe("createCodexTurnParser (legacy msg dialect)", () => {
  it("handles session, message, exec and completion envelopes", () => {
    const parser = createCodexTurnParser()
    expect(
      parser.push(
        line({
          id: "0",
          msg: { type: "session_configured", session_id: "s-9" },
        })
      )
    ).toEqual([{ type: "session", sessionId: "s-9" }])
    parser.push(
      line({ id: "1", msg: { type: "agent_message", message: "Hi." } })
    )
    expect(parser.text()).toBe("Hi.")
    const end = parser.push(line({ id: "2", msg: { type: "task_complete" } }))
    expect(end[0]).toMatchObject({ type: "result", state: "completed" })
  })

  it("ignores non-JSON banner noise", () => {
    const parser = createCodexTurnParser()
    expect(parser.push("OpenAI Codex v0.99 (research preview)")).toEqual([])
    expect(parser.text()).toBe("")
  })
})
