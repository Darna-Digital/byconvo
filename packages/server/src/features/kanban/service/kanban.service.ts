import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { NotFound } from "../../../layers/errors.ts"
import {
  KanbanRepository,
  type KanbanFailure,
  type KanbanRepo,
} from "../repository/kanban.repository.ts"
import type { Card } from "../schema/kanban.schema.model.ts"
import { resolveTask } from "../tasks.ts"

export interface KanbanServiceShape extends KanbanRepo {
  /** Every card, flattened — the agent-facing task list. */
  readonly listTasks: Effect.Effect<ReadonlyArray<Card>, KanbanFailure>
  /** Resolve a free-form reference ("DAR-123" / phrase / title) to a task. */
  readonly resolveTask: (ref: string) => Effect.Effect<Card, KanbanFailure>
}

export class KanbanService extends Context.Service<
  KanbanService,
  KanbanServiceShape
>()("KanbanService") {}

export const make = Effect.gen(function* () {
  const repo = yield* KanbanRepository

  const listTasks = Effect.map(repo.board, (board) => board.cards)

  const resolve: KanbanServiceShape["resolveTask"] = (ref) =>
    Effect.flatMap(repo.board, (board) => {
      const found = resolveTask(board.cards, ref)
      return found === null
        ? Effect.fail(new NotFound({ reason: `no task matches "${ref}"` }))
        : Effect.succeed(found)
    })

  return KanbanService.of({ ...repo, listTasks, resolveTask: resolve })
})
