/**
 * `kanban` feature — the Trello-style board logic: grouping cards into ordered
 * columns, creating cards, and moving a card to another column (computing its
 * new sort order). Grouping/move are real, board-shaped logic, so they live
 * here as pure functions over injected data + API side effects.
 */
import type { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/api/types"

export const COLUMNS: ReadonlyArray<{
  key: KanbanColumn
  title: string
}> = [
  { key: "todo", title: "To do" },
  { key: "in_progress", title: "In progress" },
  { key: "done", title: "Done" },
]

export interface ColumnGroup {
  readonly key: KanbanColumn
  readonly title: string
  readonly cards: ReadonlyArray<KanbanCard>
}

export interface KanbanDependencies {
  data: { readonly board: KanbanBoard | null }
  sideEffects: {
    readonly create: (input: {
      title: string
      description?: string
      column?: KanbanColumn
    }) => Promise<KanbanCard>
    readonly update: (
      id: string,
      input: {
        title?: string
        description?: string
        column?: KanbanColumn
        order?: number
      }
    ) => Promise<KanbanCard>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface KanbanFunctions {
  /** The board's cards grouped into the fixed columns, each sorted by order. */
  readonly columns: () => ReadonlyArray<ColumnGroup>
  /** Create a card; returns null when the title is blank (no-op). */
  readonly create: (
    title: string,
    column: KanbanColumn
  ) => Promise<KanbanCard | null>
  /** Move a card to another column (appended last); null when already there. */
  readonly move: (
    card: KanbanCard,
    column: KanbanColumn
  ) => Promise<KanbanCard | null>
  readonly update: (
    id: string,
    input: { title?: string; description?: string }
  ) => Promise<KanbanCard>
  readonly remove: (id: string) => Promise<void>
}
