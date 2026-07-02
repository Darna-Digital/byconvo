import { describe, expect, it } from "vitest"
import { applyChatEvent, isChatRunning } from "./chats.reducer"
import { activity, chat, message, turn } from "./chats.functions.mock"

const streamingChat = () =>
  chat({
    messages: [
      message({ id: "m-u", role: "user", text: "hey", streaming: false }),
      message({ id: "m-a", role: "assistant", text: "", streaming: true }),
    ],
    latestTurn: turn({ state: "running" }),
  })

describe("applyChatEvent", () => {
  it("turn-started adopts the server's chat wholesale", () => {
    const next = applyChatEvent(null, {
      type: "turn-started",
      chat: streamingChat(),
    })
    expect(next?.messages).toHaveLength(2)
    expect(isChatRunning(next)).toBe(true)
  })

  it("delta appends to the right message only", () => {
    let state = streamingChat()
    state = applyChatEvent(state, {
      type: "delta",
      messageId: "m-a",
      text: "Hey",
    })!
    state = applyChatEvent(state, {
      type: "delta",
      messageId: "m-a",
      text: "!",
    })!
    expect(state.messages.find((m) => m.id === "m-a")?.text).toBe("Hey!")
    expect(state.messages.find((m) => m.id === "m-u")?.text).toBe("hey")
  })

  it("activity appends once, deduping replays by id", () => {
    let state = streamingChat()
    const a = activity()
    state = applyChatEvent(state, { type: "activity", activity: a })!
    state = applyChatEvent(state, { type: "activity", activity: a })!
    expect(state.activities).toHaveLength(1)
  })

  it("turn-completed settles the message with authoritative text", () => {
    let state = streamingChat()
    state = applyChatEvent(state, {
      type: "delta",
      messageId: "m-a",
      text: "partial",
    })!
    state = applyChatEvent(state, {
      type: "turn-completed",
      turn: turn({
        state: "completed",
        endedAt: "2026-01-01T00:01:00.000Z",
      }),
      messageId: "m-a",
      text: "the full final text",
    })!
    const settled = state.messages.find((m) => m.id === "m-a")
    expect(settled?.text).toBe("the full final text")
    expect(settled?.streaming).toBe(false)
    expect(state.latestTurn?.state).toBe("completed")
    expect(isChatRunning(state)).toBe(false)
  })

  it("events without a chat yet are ignored (except turn-started)", () => {
    expect(
      applyChatEvent(null, { type: "delta", messageId: "m", text: "x" })
    ).toBeNull()
  })
})
