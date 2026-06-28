import type { Doc } from "@/lib/api/types"
import type { DocsDependencies } from "../entity/docs.interfaces"

const doc = (over: Partial<Doc> = {}): Doc => ({
  id: "plan",
  title: "Plan",
  content: "# Plan\n\n",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

export function mockDocsDependencies() {
  const calls = {
    create: [] as Array<string>,
    save: [] as Array<{ id: string; content: string }>,
    remove: [] as Array<string>,
  }

  const deps: DocsDependencies = {
    data: {},
    sideEffects: {
      create: async (title) => {
        calls.create.push(title)
        return doc({ title })
      },
      save: async (id, content) => {
        calls.save.push({ id, content })
        return doc({ id, content })
      },
      remove: async (id) => {
        calls.remove.push(id)
      },
    },
  }

  return { deps, calls }
}
