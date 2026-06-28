/**
 * File-backed Kanban board — persists cards (and the key counter) to
 * `.byconvo/kanban.json` inside the selected repository.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import { Card } from "../schema/kanban.schema.model.ts"
import type {
  CreateCardInput,
  KanbanRepo,
  UpdateCardInput,
} from "./kanban.repository.ts"

const KanbanState = Schema.Struct({
  cards: Schema.Array(Card),
  counter: Schema.Number,
})
type KanbanState = typeof KanbanState.Type

const EMPTY: KanbanState = { cards: [], counter: 0 }

const kanbanPath = (repoPath: string) => `${repoPath}/.byconvo/kanban.json`

const readState = (repoPath: string): KanbanState => {
  try {
    const raw = readFileSync(kanbanPath(repoPath), "utf8")
    return Schema.decodeUnknownSync(KanbanState)(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return EMPTY
    }
    throw error
  }
}

const writeState = (repoPath: string, state: KanbanState) => {
  mkdirSync(`${repoPath}/.byconvo`, { recursive: true })
  writeFileSync(kanbanPath(repoPath), `${JSON.stringify(state, null, 2)}\n`)
}

export const makeFileKanbanRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        catch: (error) =>
          error instanceof NotFound
            ? error
            : new StorageError({
                reason: error instanceof Error ? error.message : String(error),
              }),
      })
    )

  const board: KanbanRepo["board"] = withFile((repoPath) => ({
    cards: [...readState(repoPath).cards].sort((a, b) => a.order - b.order),
  }))

  const create: KanbanRepo["create"] = (input: CreateCardInput) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const counter = state.counter + 1
      const now = new Date().toISOString()
      const maxOrder = state.cards
        .filter((c) => c.column === input.column)
        .reduce((max, c) => Math.max(max, c.order), 0)
      const created: Card = {
        id: `card-${Date.now().toString(36)}-${counter}`,
        key: `T-${counter}`,
        title: input.title,
        description: input.description,
        column: input.column,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      }
      writeState(repoPath, {
        cards: [...state.cards, created],
        counter,
      })
      return created
    })

  const update: KanbanRepo["update"] = (id, input: UpdateCardInput) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const existing = state.cards.find((c) => c.id === id)
      if (existing === undefined) {
        throw new NotFound({ reason: `card ${id} not found` })
      }
      const updated: Card = {
        ...existing,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        column: input.column ?? existing.column,
        order: input.order ?? existing.order,
        updatedAt: new Date().toISOString(),
      }
      writeState(repoPath, {
        cards: state.cards.map((c) => (c.id === id ? updated : c)),
        counter: state.counter,
      })
      return updated
    })

  const remove: KanbanRepo["remove"] = (id) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      writeState(repoPath, {
        cards: state.cards.filter((c) => c.id !== id),
        counter: state.counter,
      })
    })

  return { board, create, update, remove } satisfies KanbanRepo
})
