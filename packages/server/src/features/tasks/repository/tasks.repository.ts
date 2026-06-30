/** Tasks board store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import type { Board, Card, TasksColumn } from "../schema/tasks.schema.model.ts"

export interface CreateCardInput {
  readonly title: string
  readonly description: string
  /** Target column id; defaults to the first column when omitted. */
  readonly column?: TasksColumn
}

export interface UpdateCardInput {
  readonly title?: string
  readonly description?: string
  readonly column?: TasksColumn
  readonly order?: number
}

export interface UpdateColumnInput {
  readonly name?: string
  readonly order?: number
}

export type TasksFailure = NoRepoSelected | NotFound | StorageError

export interface TasksRepo {
  readonly board: Effect.Effect<Board, TasksFailure>
  readonly create: (input: CreateCardInput) => Effect.Effect<Card, TasksFailure>
  readonly update: (
    id: string,
    input: UpdateCardInput
  ) => Effect.Effect<Card, TasksFailure>
  readonly remove: (id: string) => Effect.Effect<void, TasksFailure>
  /** Set the prefix new card keys are minted with; returns the board. */
  readonly setPrefix: (prefix: string) => Effect.Effect<Board, TasksFailure>
  /** Add a status column; returns the updated board. */
  readonly addColumn: (name: string) => Effect.Effect<Board, TasksFailure>
  /** Rename and/or reorder a column; returns the updated board. */
  readonly updateColumn: (
    id: string,
    input: UpdateColumnInput
  ) => Effect.Effect<Board, TasksFailure>
  /** Remove a column, moving its cards to the first remaining column. */
  readonly removeColumn: (id: string) => Effect.Effect<Board, TasksFailure>
  /** Append a comment (or a reply, when `parentId` is set) to a card. */
  readonly addComment: (
    cardId: string,
    body: string,
    parentId: string | null
  ) => Effect.Effect<Card, TasksFailure>
  /** Remove a comment from a card; returns the updated card. */
  readonly removeComment: (
    cardId: string,
    commentId: string
  ) => Effect.Effect<Card, TasksFailure>
}

export class TasksRepository extends Context.Service<
  TasksRepository,
  TasksRepo
>()("TasksRepository") {}
