import type { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/api/types"
import type { KanbanDependencies } from "../entity/kanban.interfaces"

export const card = (over: Partial<KanbanCard> = {}): KanbanCard => ({
  id: "card-1",
  key: "T-1",
  title: "Task",
  description: "",
  column: "todo",
  order: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

export function mockKanbanDependencies(cards: ReadonlyArray<KanbanCard> = []) {
  const board: KanbanBoard = { cards: [...cards], prefix: "T" }
  const calls = {
    create: [] as Array<{
      title: string
      description?: string
      column?: KanbanColumn
    }>,
    update: [] as Array<{
      id: string
      input: {
        title?: string
        description?: string
        column?: KanbanColumn
        order?: number
      }
    }>,
    remove: [] as Array<string>,
  }

  const deps: KanbanDependencies = {
    data: { board },
    sideEffects: {
      create: async (input) => {
        calls.create.push(input)
        return card({ title: input.title, column: input.column ?? "todo" })
      },
      update: async (id, input) => {
        calls.update.push({ id, input })
        return card({ id, ...input })
      },
      remove: async (id) => {
        calls.remove.push(id)
      },
    },
  }

  return { deps, calls }
}
