/** In-memory Tasks board for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import {
  type Card,
  type Column,
  DEFAULT_COLUMNS,
} from "../schema/tasks.schema.model.ts"
import { normalizePrefix } from "../tasks.ts"
import type {
  CreateCardInput,
  TasksRepo,
  UpdateCardInput,
  UpdateColumnInput,
} from "./tasks.repository.ts"

const NOW = "2026-01-01T00:00:00.000Z"

const sortedColumns = (columns: ReadonlyArray<Column>): ReadonlyArray<Column> =>
  [...columns].sort((a, b) => a.order - b.order)

export const makeMemoryTasksRepository = (
  seed: ReadonlyArray<Card> = [],
  initialPrefix = "T"
) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Card>>([...seed])
    const prefixRef = yield* Ref.make(initialPrefix)
    const columnsRef = yield* Ref.make<ReadonlyArray<Column>>([
      ...DEFAULT_COLUMNS,
    ])
    let counter = seed.length

    const board = Effect.gen(function* () {
      const cards = yield* Ref.get(store)
      const prefix = yield* Ref.get(prefixRef)
      const columns = yield* Ref.get(columnsRef)
      return {
        cards: [...cards].sort((a, b) => a.order - b.order),
        columns: sortedColumns(columns),
        prefix,
      }
    })

    const repo: TasksRepo = {
      board,
      create: (input: CreateCardInput) =>
        Effect.gen(function* () {
          counter += 1
          const cards = yield* Ref.get(store)
          const prefix = yield* Ref.get(prefixRef)
          const columns = yield* Ref.get(columnsRef)
          const column = input.column ?? sortedColumns(columns)[0]?.id ?? "todo"
          const maxOrder = cards
            .filter((c) => c.column === column)
            .reduce((max, c) => Math.max(max, c.order), 0)
          const created: Card = {
            id: `card-mem-${counter}`,
            key: `${prefix}-${counter}`,
            title: input.title,
            description: input.description,
            column,
            order: maxOrder + 1,
            comments: [],
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
      setPrefix: (prefix) =>
        Effect.flatMap(
          Ref.set(prefixRef, normalizePrefix(prefix)),
          () => board
        ),
      addColumn: (name) =>
        Effect.gen(function* () {
          const columns = yield* Ref.get(columnsRef)
          const maxOrder = columns.reduce((m, c) => Math.max(m, c.order), -1)
          const column: Column = {
            id: `col-mem-${columns.length + 1}`,
            name: name.trim().length > 0 ? name.trim() : "New column",
            order: maxOrder + 1,
          }
          yield* Ref.update(columnsRef, (all) => [...all, column])
          return yield* board
        }),
      updateColumn: (id, input: UpdateColumnInput) =>
        Effect.gen(function* () {
          const columns = yield* Ref.get(columnsRef)
          const existing = columns.find((c) => c.id === id)
          if (existing === undefined) {
            return yield* Effect.fail(
              new NotFound({ reason: `column ${id} not found` })
            )
          }
          yield* Ref.update(columnsRef, (all) =>
            all.map((c) =>
              c.id === id
                ? {
                    ...c,
                    name:
                      input.name !== undefined && input.name.trim().length > 0
                        ? input.name.trim()
                        : c.name,
                    order: input.order ?? c.order,
                  }
                : c
            )
          )
          return yield* board
        }),
      removeColumn: (id) =>
        Effect.gen(function* () {
          const columns = yield* Ref.get(columnsRef)
          if (columns.length <= 1) {
            return yield* Effect.fail(
              new StorageError({ reason: "a board needs at least one column" })
            )
          }
          const remaining = sortedColumns(columns.filter((c) => c.id !== id))
          const fallback = remaining[0]?.id ?? "todo"
          yield* Ref.set(columnsRef, remaining)
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.column === id ? { ...c, column: fallback } : c))
          )
          return yield* board
        }),
      addComment: (cardId, body, parentId) =>
        Effect.gen(function* () {
          const cards = yield* Ref.get(store)
          const existing = cards.find((c) => c.id === cardId)
          if (existing === undefined) {
            return yield* Effect.fail(
              new NotFound({ reason: `card ${cardId} not found` })
            )
          }
          const updated: Card = {
            ...existing,
            comments: [
              ...existing.comments,
              {
                id: `cmt-mem-${existing.comments.length + 1}`,
                body: body.trim(),
                parentId,
                createdAt: NOW,
              },
            ],
            updatedAt: NOW,
          }
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.id === cardId ? updated : c))
          )
          return updated
        }),
      removeComment: (cardId, commentId) =>
        Effect.gen(function* () {
          const cards = yield* Ref.get(store)
          const existing = cards.find((c) => c.id === cardId)
          if (existing === undefined) {
            return yield* Effect.fail(
              new NotFound({ reason: `card ${cardId} not found` })
            )
          }
          const updated: Card = {
            ...existing,
            comments: existing.comments.filter((c) => c.id !== commentId),
            updatedAt: NOW,
          }
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.id === cardId ? updated : c))
          )
          return updated
        }),
    }
    return repo
  })
