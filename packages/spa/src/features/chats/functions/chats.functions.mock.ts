/** Mock dependencies + fixtures for the chats feature tests. */
import type { Chat, ChatActivity, ChatMessage, ChatTurn } from "@/lib/api/types"
import type { ChatsDependencies } from "../entity/chats.interfaces"

export const chat = (overrides: Partial<Chat> = {}): Chat => ({
  id: "c-1",
  title: "New thread",
  provider: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  access: "fullAccess",
  mode: "build",
  branch: "main",
  sessionId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [],
  activities: [],
  latestTurn: null,
  ...overrides,
})

export const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m-1",
  role: "assistant",
  text: "",
  turnId: "turn-1",
  streaming: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

export const activity = (
  overrides: Partial<ChatActivity> = {}
): ChatActivity => ({
  id: "a-1",
  turnId: "turn-1",
  kind: "tool.started",
  tone: "tool",
  summary: "Bash — ls",
  detail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

export const turn = (overrides: Partial<ChatTurn> = {}): ChatTurn => ({
  id: "turn-1",
  state: "running",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
  errorMessage: null,
  totalCostUsd: null,
  ...overrides,
})

export interface ChatsCalls {
  create: Array<Parameters<ChatsDependencies["sideEffects"]["create"]>[0]>
  send: Array<{ id: string; text: string }>
  update: Array<{
    id: string
    input: Parameters<ChatsDependencies["sideEffects"]["update"]>[1]
  }>
  stop: string[]
  remove: string[]
}

export function mockChatsDependencies(): {
  deps: ChatsDependencies
  calls: ChatsCalls
} {
  const calls: ChatsCalls = {
    create: [],
    send: [],
    update: [],
    stop: [],
    remove: [],
  }
  const deps: ChatsDependencies = {
    data: {},
    sideEffects: {
      create: async (input) => {
        calls.create.push(input)
        return chat({ id: `c-${calls.create.length}` })
      },
      send: async (id, text) => {
        calls.send.push({ id, text })
        return chat({ id })
      },
      update: async (id, input) => {
        calls.update.push({ id, input })
        return chat({ id, title: input.title ?? "New thread" })
      },
      stop: async (id) => {
        calls.stop.push(id)
      },
      remove: async (id) => {
        calls.remove.push(id)
      },
    },
  }
  return { deps, calls }
}
