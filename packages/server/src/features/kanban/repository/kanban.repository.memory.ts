/** In-memory Kanban board for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import type { Card } from "../schema/kanban.schema.model.ts"
import type {
  CreateCardInput,
  KanbanRepo,
  UpdateCardInput,
} from "./kanban.repository.ts"

const NOW = "2026-01-01T00:00:00.000Z"

export const makeMemoryKanbanRepository = (seed: ReadonlyArray<Card> = []) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Card>>([...seed])
    let counter = seed.length

    const repo: KanbanRepo = {
      board: Ref.get(store).pipe(
        Effect.map((cards) => ({
          cards: [...cards].sort((a, b) => a.order - b.order),
        }))
      ),
      create: (input: CreateCardInput) =>
        Effect.gen(function* () {
          counter += 1
          const cards = yield* Ref.get(store)
          const maxOrder = cards
            .filter((c) => c.column === input.column)
            .reduce((max, c) => Math.max(max, c.order), 0)
          const created: Card = {
            id: `card-mem-${counter}`,
            key: `T-${counter}`,
            title: input.title,
            description: input.description,
            column: input.column,
            order: maxOrder + 1,
            createdAt: NOW,
            updatedAt: NOW,
          }
          yield* Ref.update(store, (all) => [...all, created])
          return created
        }),
      update: (id, input: UpdateCardInput) =>
        Effect.gen(function* () {
          const cards = yield* Ref.get(store)
          const existing = cards.find((c) => c.id === id)
          if (existing === undefined) {
            return yield* Effect.fail(
              new NotFound({ reason: `card ${id} not found` })
            )
          }
          const updated: Card = {
            ...existing,
            title: input.title ?? existing.title,
            description: input.description ?? existing.description,
            column: input.column ?? existing.column,
            order: input.order ?? existing.order,
            updatedAt: NOW,
          }
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.id === id ? updated : c))
          )
          return updated
        }),
      remove: (id) =>
        Ref.update(store, (all) => all.filter((c) => c.id !== id)),
    }
    return repo
  })
