import type { Chat, ChatAgent } from "@/lib/api/types"
import type { ChatsDependencies } from "../entity/chats.interfaces"

const chat = (over: Partial<Chat> = {}): Chat => ({
  id: "c-1",
  title: "Claude Code",
  agent: "claude",
  branch: "main",
  taskKey: null,
  initialPrompt: "",
  agentSessionId: null,
  model: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [],
  ...over,
})

/** Records calls so tests can assert how the functions orchestrate side effects. */
export function mockChatsDependencies() {
  const calls = {
    create: [] as Array<{
      title?: string
      agent: ChatAgent
      branch?: string
      taskKey?: string | null
    }>,
    rename: [] as Array<{
      id: string
      input: { title: string; branch?: string; taskKey?: string | null }
    }>,
    remove: [] as Array<string>,
  }

  const deps: ChatsDependencies = {
    data: {},
    sideEffects: {
      create: async (input) => {
        calls.create.push(input)
        return chat({
          title: input.title ?? "Claude Code",
          agent: input.agent,
          branch: input.branch ?? "main",
          taskKey: input.taskKey ?? null,
        })
      },
      rename: async (id, input) => {
        calls.rename.push({ id, input })
        return chat({ id, title: input.title, taskKey: input.taskKey ?? null })
      },
      remove: async (id) => {
        calls.remove.push(id)
      },
    },
  }

  return { deps, calls }
}
