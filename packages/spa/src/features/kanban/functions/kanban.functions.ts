import type { KanbanCard } from "@/lib/api/types"
import {
  COLUMNS,
  type ColumnGroup,
  type KanbanDependencies,
  type KanbanFunctions,
} from "../entity/kanban.interfaces"

export function createKanbanFunctions(d: KanbanDependencies): KanbanFunctions {
  const allCards = (): ReadonlyArray<KanbanCard> => d.data.board?.cards ?? []

  const columns = (): ReadonlyArray<ColumnGroup> =>
    COLUMNS.map(({ key, title }) => ({
      key,
      title,
      cards: allCards()
        .filter((card) => card.column === key)
        .sort((a, b) => a.order - b.order),
    }))

  const create: KanbanFunctions["create"] = async (title, column) => {
    const trimmed = title.trim()
    if (trimmed.length === 0) return null
    return d.sideEffects.create({ title: trimmed, column })
  }

  const move: KanbanFunctions["move"] = async (card, column) => {
    if (card.column === column) return null
    // Append to the end of the target column.
    const maxOrder = allCards()
      .filter((c) => c.column === column)
      .reduce((max, c) => Math.max(max, c.order), 0)
    return d.sideEffects.update(card.id, { column, order: maxOrder + 1 })
  }

  const update: KanbanFunctions["update"] = (id, input) =>
    d.sideEffects.update(id, input)

  const remove: KanbanFunctions["remove"] = (id) => d.sideEffects.remove(id)

  return { columns, create, move, update, remove }
}
