import type { TasksBoard, TasksCard, TasksColumn } from "@/lib/api/types"
import type { TasksDependencies } from "../entity/tasks.interfaces"

export const card = (over: Partial<TasksCard> = {}): TasksCard => ({
  id: "card-1",
  key: "T-1",
  title: "Task",
  description: "",
  column: "todo",
  order: 1,
  comments: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

export function mockTasksDependencies(cards: ReadonlyArray<TasksCard> = []) {
  const board: TasksBoard = {
    cards: [...cards],
    columns: [
      { id: "todo", name: "To do", order: 0 },
      { id: "in_progress", name: "In progress", order: 1 },
      { id: "done", name: "Done", order: 2 },
    ],
    prefix: "T",
  }
  const calls = {
    create: [] as Array<{
      title: string
      description?: string
      column?: TasksColumn
    }>,
    update: [] as Array<{
      id: string
      input: {
        title?: string
        description?: string
        column?: TasksColumn
        order?: number
      }
    }>,
    remove: [] as Array<string>,
  }

  const deps: TasksDependencies = {
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
