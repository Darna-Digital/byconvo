import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import {
  KanbanRepository,
  type KanbanRepo,
} from "../repository/kanban.repository.ts"

export interface KanbanServiceShape extends KanbanRepo {}

export class KanbanService extends Context.Service<
  KanbanService,
  KanbanServiceShape
>()("KanbanService") {}

export const make = Effect.gen(function* () {
  const repo = yield* KanbanRepository
  return KanbanService.of(repo)
})
