import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { NotFound } from "../../../layers/errors.ts"
import {
  TasksRepository,
  type TasksFailure,
  type TasksRepo,
} from "../repository/tasks.repository.ts"
import type { Card, CommentResolution } from "../schema/tasks.schema.model.ts"
import { resolveTask } from "../tasks.ts"

export interface TasksServiceShape extends TasksRepo {
  /** Every card, flattened — the agent-facing task list. */
  readonly listTasks: Effect.Effect<ReadonlyArray<Card>, TasksFailure>
  /** Resolve a free-form reference ("DAR-123" / phrase / title) to a task. */
  readonly resolveTask: (ref: string) => Effect.Effect<Card, TasksFailure>
  /** Resolve a comment id (from its copied link) to the comment + its task. */
  readonly resolveComment: (
    commentId: string
  ) => Effect.Effect<CommentResolution, TasksFailure>
}

export class TasksService extends Context.Service<
  TasksService,
  TasksServiceShape
>()("TasksService") {}

export const make = Effect.gen(function* () {
  const repo = yield* TasksRepository

  const listTasks = Effect.map(repo.board, (board) => board.cards)

  const resolve: TasksServiceShape["resolveTask"] = (ref) =>
    Effect.flatMap(repo.board, (board) => {
      const found = resolveTask(board.cards, ref)
      return found === null
        ? Effect.fail(new NotFound({ reason: `no task matches "${ref}"` }))
        : Effect.succeed(found)
    })

  const resolveComment: TasksServiceShape["resolveComment"] = (commentId) =>
    Effect.flatMap(repo.board, (board) => {
      for (const card of board.cards) {
        const comment = card.comments.find((c) => c.id === commentId)
        if (comment !== undefined) return Effect.succeed({ card, comment })
      }
      return Effect.fail(
        new NotFound({ reason: `no comment matches "${commentId}"` })
      )
    })

  return TasksService.of({
    ...repo,
    listTasks,
    resolveTask: resolve,
    resolveComment,
  })
})
