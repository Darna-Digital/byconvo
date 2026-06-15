/**
 * SQLite-backed comment store — persists local review comments to
 * `.reviewer/comments.db` inside the selected repository, via the repository
 * pattern (implements {@link CommentsRepo}). Supersedes the JSON-file store.
 *
 * better-sqlite3 is synchronous, so every call is wrapped in `Effect.try` and
 * mapped to a `StorageError`. Connections are cached per repo root so switching
 * the selected repository at runtime opens a fresh database lazily.
 */
import Database from "better-sqlite3"
import * as Effect from "effect/Effect"
import { mkdirSync } from "node:fs"
import { StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type { ReviewComment } from "../schema/comments.schema.model.ts"
import type { CommentsRepo } from "./comments.repository.ts"

const connections = new Map<string, Database.Database>()

/** Open (or reuse) the comments database for a repository root. */
const openDb = (repoPath: string): Database.Database => {
  const existing = connections.get(repoPath)
  if (existing !== undefined) return existing

  const dir = `${repoPath}/.reviewer`
  mkdirSync(dir, { recursive: true })
  const db = new Database(`${dir}/comments.db`)
  db.pragma("journal_mode = WAL")
  db.exec(`CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    filePath    TEXT NOT NULL,
    side        TEXT NOT NULL,
    lineNumber  INTEGER NOT NULL,
    body        TEXT NOT NULL,
    author      TEXT NOT NULL,
    createdAt   TEXT NOT NULL,
    target      TEXT NOT NULL,
    source      TEXT NOT NULL
  )`)
  connections.set(repoPath, db)
  return db
}

// Module-scoped so ids stay unique even though the repository is built per
// request (a request-scoped closure counter would reset and could collide).
let counter = 0

export const makeSqliteCommentsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withDb = <A>(f: (db: Database.Database) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(openDb(repoPath)),
        catch: (error) =>
          new StorageError({
            reason: error instanceof Error ? error.message : String(error),
          }),
      })
    )

  const list: CommentsRepo["list"] = withDb(
    (db) =>
      db
        .prepare("SELECT * FROM comments ORDER BY createdAt ASC")
        .all() as Array<ReviewComment>
  )

  const add: CommentsRepo["add"] = (input) =>
    withDb((db) => {
      counter += 1
      const created: ReviewComment = {
        ...input,
        id: `c-${Date.now().toString(36)}-${counter}`,
        createdAt: new Date().toISOString(),
        source: "local",
      }
      db.prepare(
        `INSERT INTO comments (id, filePath, side, lineNumber, body, author, createdAt, target, source)
         VALUES (@id, @filePath, @side, @lineNumber, @body, @author, @createdAt, @target, @source)`
      ).run(created)
      return created
    })

  const remove: CommentsRepo["remove"] = (id) =>
    withDb((db) => {
      db.prepare("DELETE FROM comments WHERE id = ?").run(id)
    })

  return { list, add, remove } satisfies CommentsRepo
})
