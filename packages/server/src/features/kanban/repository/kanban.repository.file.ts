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
import { normalizePrefix } from "../tasks.ts"
import type {
  CreateCardInput,
  KanbanRepo,
  UpdateCardInput,
} from "./kanban.repository.ts"

const DEFAULT_PREFIX = "T"

// `prefix` is optional on disk so boards written before it existed still decode;
// it's normalized to a concrete string on read.
const KanbanState = Schema.Struct({
  cards: Schema.Array(Card),
  counter: Schema.Number,
  prefix: Schema.optionalKey(Schema.String),
})

interface State {
  readonly cards: ReadonlyArray<Card>
  readonly counter: number
  readonly prefix: string
}

const EMPTY: State = { cards: [], counter: 0, prefix: DEFAULT_PREFIX }

const kanbanPath = (repoPath: string) => `${repoPath}/.byconvo/kanban.json`

const readState = (repoPath: string): State => {
  try {
    const raw = readFileSync(kanbanPath(repoPath), "utf8")
    const decoded = Schema.decodeUnknownSync(KanbanState)(JSON.parse(raw))
    return {
      cards: decoded.cards,
      counter: decoded.counter,
      prefix:
        decoded.prefix !== undefined && decoded.prefix.length > 0
          ? decoded.prefix
          : DEFAULT_PREFIX,
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return EMPTY
    }
    throw error
  }
}

const writeState = (repoPath: string, state: State) => {
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

  const board: KanbanRepo["board"] = withFile((repoPath) => {
    const state = readState(repoPath)
    return {
      cards: [...state.cards].sort((a, b) => a.order - b.order),
      prefix: state.prefix,
    }
  })

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
        key: `${state.prefix}-${counter}`,
        title: input.title,
        description: input.description,
        column: input.column,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      }
      writeState(repoPath, {
        ...state,
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
        ...state,
        cards: state.cards.map((c) => (c.id === id ? updated : c)),
      })
      return updated
    })

  const remove: KanbanRepo["remove"] = (id) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      writeState(repoPath, {
        ...state,
        cards: state.cards.filter((c) => c.id !== id),
      })
    })

  const setPrefix: KanbanRepo["setPrefix"] = (prefix) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const next = { ...state, prefix: normalizePrefix(prefix) }
      writeState(repoPath, next)
      return {
        cards: [...next.cards].sort((a, b) => a.order - b.order),
        prefix: next.prefix,
      }
    })

  return { board, create, update, remove, setPrefix } satisfies KanbanRepo
})
