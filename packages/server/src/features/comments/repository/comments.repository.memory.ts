/** In-memory comment store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import type { ReviewComment } from "../schema/comments.schema.model.ts"
import type { CommentsRepo } from "./comments.repository.ts"

export const makeMemoryCommentsRepository = (seed: ReadonlyArray<ReviewComment> = []) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<ReviewComment>>([...seed])
    let counter = 0

    const repo: CommentsRepo = {
      list: Ref.get(store),
      add: (comment) =>
        Effect.gen(function* () {
          counter += 1
          const created: ReviewComment = {
            ...comment,
            id: `c-mem-${counter}`,
            createdAt: "2026-01-01T00:00:00.000Z",
            source: "local",
          }
          yield* Ref.update(store, (all) => [...all, created])
          return created
        }),
      remove: (id) => Ref.update(store, (all) => all.filter((c) => c.id !== id)),
    }
    return repo
  })
