import type { AgentKind, Thread, ThreadEntry } from "@/lib/api/types"
import type { ThreadsDependencies } from "../entity/threads.interfaces"

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: "t-1",
  title: "New thread",
  agent: "terminal",
  branch: "main",
  taskKey: null,
  initialPrompt: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  entries: [],
  ...over,
})

const entry = (over: Partial<ThreadEntry> = {}): ThreadEntry => ({
  id: "e-1",
  command: "echo hi",
  stdout: "hi",
  stderr: "",
  exitCode: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

/** Records calls so tests can assert how the functions orchestrate side effects. */
export function mockThreadsDependencies() {
  const calls = {
    create: [] as Array<{
      title?: string
      agent: AgentKind
      taskKey?: string | null
    }>,
    run: [] as Array<{ id: string; command: string }>,
    rename: [] as Array<{
      id: string
      input: { title: string; taskKey?: string | null }
    }>,
    remove: [] as Array<string>,
  }

  const deps: ThreadsDependencies = {
    data: {},
    sideEffects: {
      create: async (input) => {
        calls.create.push(input)
        return thread({
          title: input.title ?? "New thread",
          agent: input.agent,
          taskKey: input.taskKey ?? null,
        })
      },
      run: async (id, command) => {
        calls.run.push({ id, command })
        return entry({ command })
      },
      rename: async (id, input) => {
        calls.rename.push({ id, input })
        return thread({
          id,
          title: input.title,
          taskKey: input.taskKey ?? null,
        })
      },
      remove: async (id) => {
        calls.remove.push(id)
      },
    },
  }

  return { deps, calls }
}
