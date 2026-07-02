import { describe, expect, it } from "vitest"
import {
  createClaudeTurnParser,
  type ClaudeStreamEvent,
} from "./claude-stream.ts"

const line = (value: unknown) => JSON.stringify(value)

const init = line({
  type: "system",
  subtype: "init",
  session_id: "sess-1",
  model: "claude-opus-4-8",
})

const textDelta = (text: string) =>
  line({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
  })

const assistantMessage = (content: unknown[]) =>
  line({ type: "assistant", message: { role: "assistant", content } })

const result = (overrides: Record<string, unknown> = {}) =>
  line({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "done",
    total_cost_usd: 0.42,
    session_id: "sess-1",
    ...overrides,
  })

const push = (
  parser: ReturnType<typeof createClaudeTurnParser>,
  lines: string[]
): ClaudeStreamEvent[] => lines.flatMap((l) => [...parser.push(l)])

describe("createClaudeTurnParser", () => {
  it("captures the session id from the init line", () => {
    const parser = createClaudeTurnParser()
    expect(parser.push(init)).toEqual([
      { type: "session", sessionId: "sess-1" },
    ])
  })

  it("streams text deltas and assembles the message text", () => {
    const parser = createClaudeTurnParser()
    const events = push(parser, [init, textDelta("Hey"), textDelta("! Hi.")])
    const deltas = events.filter((e) => e.type === "delta")
    expect(deltas.map((d) => d.text)).toEqual(["Hey", "! Hi."])
    expect(parser.text()).toBe("Hey! Hi.")
  })

  it("does not double-append the complete assistant text after deltas", () => {
    const parser = createClaudeTurnParser()
    push(parser, [
      textDelta("Hello"),
      assistantMessage([{ type: "text", text: "Hello" }]),
    ])
    expect(parser.text()).toBe("Hello")
  })

  it("falls back to complete assistant text when no partials stream", () => {
    const parser = createClaudeTurnParser()
    const events = push(parser, [
      assistantMessage([{ type: "text", text: "No partials here." }]),
    ])
    expect(events).toEqual([{ type: "delta", text: "No partials here." }])
    expect(parser.text()).toBe("No partials here.")
  })

  it("separates assistant messages around a tool round-trip", () => {
    const parser = createClaudeTurnParser()
    push(parser, [
      textDelta("Let me check."),
      assistantMessage([
        { type: "text", text: "Let me check." },
        {
          type: "tool_use",
          id: "tu-1",
          name: "Bash",
          input: { command: "ls -la" },
        },
      ]),
      line({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "tu-1" }],
        },
      }),
      textDelta("Found it."),
    ])
    expect(parser.text()).toBe("Let me check.\n\nFound it.")
  })

  it("emits tool activities with a telling summary and matched result", () => {
    const parser = createClaudeTurnParser()
    const events = push(parser, [
      assistantMessage([
        {
          type: "tool_use",
          id: "tu-1",
          name: "Bash",
          input: { command: "pnpm test" },
        },
      ]),
      line({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tu-1", is_error: true },
          ],
        },
      }),
    ])
    const activities = events.filter((e) => e.type === "activity")
    expect(activities).toEqual([
      {
        type: "activity",
        kind: "tool.started",
        tone: "tool",
        summary: "Bash — pnpm test",
        detail: '{"command":"pnpm test"}',
      },
      {
        type: "activity",
        kind: "tool.failed",
        tone: "error",
        summary: "Bash failed",
        detail: null,
      },
    ])
  })

  it("announces thinking once per assistant message", () => {
    const parser = createClaudeTurnParser()
    const thinkingStart = line({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      },
    })
    const events = push(parser, [thinkingStart, thinkingStart])
    expect(events.filter((e) => e.type === "activity")).toHaveLength(1)
  })

  it("settles with cost on a successful result", () => {
    const parser = createClaudeTurnParser()
    const events = push(parser, [textDelta("done"), result()])
    expect(events.at(-1)).toEqual({
      type: "result",
      state: "completed",
      errorMessage: null,
      totalCostUsd: 0.42,
    })
    expect(parser.settled()).toBe(true)
  })

  it("uses the result text when nothing streamed at all", () => {
    const parser = createClaudeTurnParser()
    push(parser, [result({ result: "final answer" })])
    expect(parser.text()).toBe("final answer")
  })

  it("maps an error result to an error state with its message", () => {
    const parser = createClaudeTurnParser()
    const events = push(parser, [
      result({ is_error: true, subtype: "error_max_turns", result: "boom" }),
    ])
    expect(events.at(-1)).toEqual({
      type: "result",
      state: "error",
      errorMessage: "boom",
      totalCostUsd: 0.42,
    })
  })

  it("ignores shell noise and unknown lines", () => {
    const parser = createClaudeTurnParser()
    expect(parser.push("not json at all")).toEqual([])
    expect(parser.push(line({ type: "mystery" }))).toEqual([])
    expect(parser.text()).toBe("")
  })
})
