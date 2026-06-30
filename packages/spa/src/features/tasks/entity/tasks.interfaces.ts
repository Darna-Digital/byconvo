/**
 * `tasks` feature — the Trello-style board logic: grouping cards into ordered
 * columns, creating cards, and moving a card to another column (computing its
 * new sort order). Grouping/move are real, board-shaped logic, so they live
 * here as pure functions over injected data + API side effects.
 */
import type { TasksBoard, TasksCard, TasksColumn } from "@/lib/api/types"

export interface ColumnGroup {
  /** The column (status) id. */
  readonly key: TasksColumn
  readonly title: string
  readonly cards: ReadonlyArray<TasksCard>
}

export interface TasksDependencies {
  data: { readonly board: TasksBoard | null }
  sideEffects: {
    readonly create: (input: {
      title: string
      description?: string
      column?: TasksColumn
    }) => Promise<TasksCard>
    readonly update: (
      id: string,
      input: {
        title?: string
        description?: string
        column?: TasksColumn
        order?: number
      }
    ) => Promise<TasksCard>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface TasksFunctions {
  /** The board's cards grouped into the fixed columns, each sorted by order. */
  readonly columns: () => ReadonlyArray<ColumnGroup>
  /** Create a card; returns null when the title is blank (no-op). */
  readonly create: (
    title: string,
    column: TasksColumn
  ) => Promise<TasksCard | null>
  /** Move a card to another column (appended last); null when already there. */
  readonly move: (
    card: TasksCard,
    column: TasksColumn
  ) => Promise<TasksCard | null>
  readonly update: (
    id: string,
    input: { title?: string; description?: string }
  ) => Promise<TasksCard>
  readonly remove: (id: string) => Promise<void>
}
