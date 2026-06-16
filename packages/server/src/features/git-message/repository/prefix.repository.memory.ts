/** In-memory commit-prefix store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import type { CommitPrefix } from "../schema/git-message.schema.model.ts"
import type { PrefixRepo } from "./prefix.repository.ts"

export const makeMemoryPrefixRepository = (
  seed: ReadonlyArray<CommitPrefix> = []
) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<CommitPrefix>>([...seed])
    let counter = 0

    const repo: PrefixRepo = {
      list: Ref.get(store),
      add: (value, description) =>
        Effect.gen(function* () {
          counter += 1
          const created: CommitPrefix = {
            id: `p-mem-${counter}`,
            value,
            description,
          }
          yield* Ref.update(store, (all) => [...all, created])
          return created
        }),
      update: (id, value, description) =>
        Effect.gen(function* () {
          const all = yield* Ref.get(store)
          if (!all.some((p) => p.id === id)) {
            return yield* Effect.fail(
              new NotFound({ reason: `no commit prefix with id ${id}` })
            )
          }
          const updated: CommitPrefix = { id, value, description }
          yield* Ref.update(store, (xs) =>
            xs.map((p) => (p.id === id ? updated : p))
          )
          return updated
        }),
      remove: (id) =>
        Effect.gen(function* () {
          const all = yield* Ref.get(store)
          if (!all.some((p) => p.id === id)) {
            return yield* Effect.fail(
              new NotFound({ reason: `no commit prefix with id ${id}` })
            )
          }
          yield* Ref.update(store, (xs) => xs.filter((p) => p.id !== id))
        }),
    }
    return repo
  })
