/**
 * File-backed Tasks board — persists cards, columns (statuses) and the key
 * counter to `.byconvo/tasks.json` inside the selected repository.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import { Card, Column, DEFAULT_COLUMNS } from "../schema/tasks.schema.model.ts"
import type { Comment } from "../schema/tasks.schema.model.ts"
import { normalizePrefix } from "../tasks.ts"
import type {
  CreateCardInput,
  TasksRepo,
  UpdateCardInput,
  UpdateColumnInput,
} from "./tasks.repository.ts"

const DEFAULT_PREFIX = "T"

// `prefix` and `columns` are optional on disk so boards written before they
// existed still decode; both are normalized to concrete values on read.
const TasksState = Schema.Struct({
  cards: Schema.Array(Card),
  counter: Schema.Number,
  prefix: Schema.optionalKey(Schema.String),
  columns: Schema.optionalKey(Schema.Array(Column)),
})

interface State {
  readonly cards: ReadonlyArray<Card>
  readonly counter: number
  readonly prefix: string
  readonly columns: ReadonlyArray<Column>
}

const EMPTY: State = {
  cards: [],
  counter: 0,
  prefix: DEFAULT_PREFIX,
  columns: DEFAULT_COLUMNS,
}

const tasksPath = (repoPath: string) => `${repoPath}/.byconvo/tasks.json`

const sortedColumns = (columns: ReadonlyArray<Column>): ReadonlyArray<Column> =>
  [...columns].sort((a, b) => a.order - b.order)

const readState = (repoPath: string): State => {
  try {
    const raw = readFileSync(tasksPath(repoPath), "utf8")
    const decoded = Schema.decodeUnknownSync(TasksState)(JSON.parse(raw))
    return {
      cards: decoded.cards,
      counter: decoded.counter,
      prefix:
        decoded.prefix !== undefined && decoded.prefix.length > 0
          ? decoded.prefix
          : DEFAULT_PREFIX,
      // Seed the default columns when a board has none yet.
      columns:
        decoded.columns !== undefined && decoded.columns.length > 0
          ? decoded.columns
          : DEFAULT_COLUMNS,
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
  writeFileSync(tasksPath(repoPath), `${JSON.stringify(state, null, 2)}\n`)
}

const toBoard = (state: State) => ({
  cards: [...state.cards].sort((a, b) => a.order - b.order),
  columns: sortedColumns(state.columns),
  prefix: state.prefix,
})

/** A stable, readable column id derived from a name, unique within the board. */
const columnIdFrom = (
  name: string,
  existing: ReadonlyArray<Column>
): string => {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "column"
  const taken = new Set(existing.map((c) => c.id))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

// Module-scoped so comment ids stay unique across per-request repository instances.
let commentCounter = 0
const nextCommentId = () =>
  `cmt-${Date.now().toString(36)}-${(commentCounter += 1)}`

export const makeFileTasksRepository = Effect.gen(function* () {
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

  const board: TasksRepo["board"] = withFile((repoPath) =>
    toBoard(readState(repoPath))
  )

  const create: TasksRepo["create"] = (input: CreateCardInput) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const counter = state.counter + 1
      const now = new Date().toISOString()
      const column =
        input.column ?? sortedColumns(state.columns)[0]?.id ?? "todo"
      const maxOrder = state.cards
        .filter((c) => c.column === column)
        .reduce((max, c) => Math.max(max, c.order), 0)
      const created: Card = {
        id: `card-${Date.now().toString(36)}-${counter}`,
        key: `${state.prefix}-${counter}`,
        title: input.title,
        description: input.description,
        column,
        order: maxOrder + 1,
        comments: [],
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

  const update: TasksRepo["update"] = (id, input: UpdateCardInput) =>
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

  const remove: TasksRepo["remove"] = (id) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      writeState(repoPath, {
        ...state,
        cards: state.cards.filter((c) => c.id !== id),
      })
    })

  const setPrefix: TasksRepo["setPrefix"] = (prefix) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const next = { ...state, prefix: normalizePrefix(prefix) }
      writeState(repoPath, next)
      return toBoard(next)
    })

  const addColumn: TasksRepo["addColumn"] = (name) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const trimmed = name.trim()
      const maxOrder = state.columns.reduce((m, c) => Math.max(m, c.order), -1)
      const column: Column = {
        id: columnIdFrom(
          trimmed.length > 0 ? trimmed : "column",
          state.columns
        ),
        name: trimmed.length > 0 ? trimmed : "New column",
        order: maxOrder + 1,
      }
      const next = { ...state, columns: [...state.columns, column] }
      writeState(repoPath, next)
      return toBoard(next)
    })

  const updateColumn: TasksRepo["updateColumn"] = (
    id,
    input: UpdateColumnInput
  ) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const existing = state.columns.find((c) => c.id === id)
      if (existing === undefined) {
        throw new NotFound({ reason: `column ${id} not found` })
      }
      const updated: Column = {
        ...existing,
        name:
          input.name !== undefined && input.name.trim().length > 0
            ? input.name.trim()
            : existing.name,
        order: input.order ?? existing.order,
      }
      const next = {
        ...state,
        columns: state.columns.map((c) => (c.id === id ? updated : c)),
      }
      writeState(repoPath, next)
      return toBoard(next)
    })

  const removeColumn: TasksRepo["removeColumn"] = (id) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      // A board always keeps at least one column.
      if (state.columns.length <= 1) {
        throw new StorageError({
          reason: "a board needs at least one column",
        })
      }
      const remaining = sortedColumns(state.columns.filter((c) => c.id !== id))
      const fallback = remaining[0]?.id ?? "todo"
      const next: State = {
        ...state,
        columns: remaining,
        // Move orphaned cards to the first remaining column (no data loss).
        cards: state.cards.map((c) =>
          c.column === id ? { ...c, column: fallback } : c
        ),
      }
      writeState(repoPath, next)
      return toBoard(next)
    })

  const addComment: TasksRepo["addComment"] = (cardId, body, parentId) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const existing = state.cards.find((c) => c.id === cardId)
      if (existing === undefined) {
        throw new NotFound({ reason: `card ${cardId} not found` })
      }
      const now = new Date().toISOString()
      const comment: Comment = {
        id: nextCommentId(),
        body: body.trim(),
        parentId,
        createdAt: now,
      }
      const updated: Card = {
        ...existing,
        comments: [...existing.comments, comment],
        updatedAt: now,
      }
      writeState(repoPath, {
        ...state,
        cards: state.cards.map((c) => (c.id === cardId ? updated : c)),
      })
      return updated
    })

  const removeComment: TasksRepo["removeComment"] = (cardId, commentId) =>
    withFile((repoPath) => {
      const state = readState(repoPath)
      const existing = state.cards.find((c) => c.id === cardId)
      if (existing === undefined) {
        throw new NotFound({ reason: `card ${cardId} not found` })
      }
      const updated: Card = {
        ...existing,
        comments: existing.comments.filter((c) => c.id !== commentId),
        updatedAt: new Date().toISOString(),
      }
      writeState(repoPath, {
        ...state,
        cards: state.cards.map((c) => (c.id === cardId ? updated : c)),
      })
      return updated
    })

  return {
    board,
    create,
    update,
    remove,
    setPrefix,
    addColumn,
    updateColumn,
    removeColumn,
    addComment,
    removeComment,
  } satisfies TasksRepo
})
