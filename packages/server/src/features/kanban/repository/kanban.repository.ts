/** Kanban board store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import type {
  Board,
  Card,
  KanbanColumn,
} from "../schema/kanban.schema.model.ts"

export interface CreateCardInput {
  readonly title: string
  readonly description: string
  readonly column: KanbanColumn
}

export interface UpdateCardInput {
  readonly title?: string
  readonly description?: string
  readonly column?: KanbanColumn
  readonly order?: number
}

export type KanbanFailure = NoRepoSelected | NotFound | StorageError

export interface KanbanRepo {
  readonly board: Effect.Effect<Board, KanbanFailure>
  readonly create: (
    input: CreateCardInput
  ) => Effect.Effect<Card, KanbanFailure>
  readonly update: (
    id: string,
    input: UpdateCardInput
  ) => Effect.Effect<Card, KanbanFailure>
  readonly remove: (id: string) => Effect.Effect<void, KanbanFailure>
}

export class KanbanRepository extends Context.Service<
  KanbanRepository,
  KanbanRepo
>()("KanbanRepository") {}
