import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { afterAll, describe, expect } from "vitest"
import { memoryLayer } from "../../../layers/workspace/workspace-context.ts"
import { CommentsRepository } from "./comments.repository.ts"
import { makeSqliteCommentsRepository } from "./comments.repository.sqlite.ts"

// A real temp repo root: the sqlite store writes `.reviewer/comments.db` here.
const repoDir = mkdtempSync(`${tmpdir()}/reviewer-comments-`)
afterAll(() => rmSync(repoDir, { recursive: true, force: true }))

const SqliteRepo = Layer.effect(CommentsRepository)(
  makeSqliteCommentsRepository
).pipe(Layer.provide(memoryLayer(repoDir)))

const input = {
  filePath: "src/a.ts",
  side: "additions" as const,
  lineNumber: 12,
  body: "looks good",
  author: "alice",
  target: "worktree",
}

describe("SqliteCommentsRepository", () => {
  it.effect("add stamps id + source=local and lists it back", () =>
    Effect.gen(function* () {
      const repo = yield* CommentsRepository
      const created = yield* repo.add(input)
      expect(created.source).toBe("local")
      expect(created.id).not.toBe("")
      const all = yield* repo.list
      expect(all.map((c) => c.body)).toContain("looks good")
    }).pipe(Effect.provide(SqliteRepo))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const repo = yield* CommentsRepository
      const created = yield* repo.add({ ...input, body: "to be removed" })
      yield* repo.remove(created.id)
      const remaining = yield* repo.list
      expect(remaining.map((c) => c.id)).not.toContain(created.id)
    }).pipe(Effect.provide(SqliteRepo))
  )

  it.effect(
    "persists across repository instances (unlike the in-memory store)",
    () =>
      Effect.gen(function* () {
        // Add through one repository instance...
        const created = yield* Effect.gen(function* () {
          const repo = yield* CommentsRepository
          return yield* repo.add({ ...input, body: "durable" })
        }).pipe(Effect.provide(SqliteRepo))

        // ...and read it back through a freshly-built one (new request).
        const all = yield* Effect.gen(function* () {
          const repo = yield* CommentsRepository
          return yield* repo.list
        }).pipe(Effect.provide(SqliteRepo))

        expect(all.map((c) => c.id)).toContain(created.id)
      })
  )
})
