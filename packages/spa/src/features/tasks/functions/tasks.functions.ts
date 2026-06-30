import type { TasksCard } from "@/lib/api/types"
import type {
  ColumnGroup,
  TasksDependencies,
  TasksFunctions,
} from "../entity/tasks.interfaces"

export function createTasksFunctions(d: TasksDependencies): TasksFunctions {
  const allCards = (): ReadonlyArray<TasksCard> => d.data.board?.cards ?? []

  // Group cards into the board's user-defined columns, in display order.
  const columns = (): ReadonlyArray<ColumnGroup> => {
    const board = d.data.board
    if (board === null) return []
    return [...board.columns]
      .sort((a, b) => a.order - b.order)
      .map((col) => ({
        key: col.id,
        title: col.name,
        cards: board.cards
          .filter((card) => card.column === col.id)
          .sort((a, b) => a.order - b.order),
      }))
  }

  const create: TasksFunctions["create"] = async (title, column) => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return null
    return d.sideEffects.create({ title: trimmed, column })
  }

  const move: TasksFunctions["move"] = async (card, column) => {
    if (card.column === column) return null
    // Append to the end of the target column.
    const maxOrder = allCards()
      .filter((c) => c.column === column)
      .reduce((max, c) => Math.max(max, c.order), 0)
    return d.sideEffects.update(card.id, { column, order: maxOrder + 1 })
  }

  const update: TasksFunctions["update"] = (id, input) =>
    d.sideEffects.update(id, input)

  const remove: TasksFunctions["remove"] = (id) => d.sideEffects.remove(id)

  return { columns, create, move, update, remove }
}
