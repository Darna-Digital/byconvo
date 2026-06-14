/**
 * Filesystem-backed comment store — persists to `.reviewer/comments.json`
 * inside the selected repository. Ports `core/Comments.ts`.
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"
import { StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type { ReviewComment } from "../schema/comments.schema.model.ts"
import type { CommentsRepo } from "./comments.repository.ts"

const toStorageError = (error: PlatformError) => new StorageError({ reason: error.message })

export const makeGitCommentsRepository = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const ctx = yield* WorkspaceContext

  const commentsFile = Effect.map(ctx.requireCurrent, (repoPath) => ({
    dir: `${repoPath}/.reviewer`,
    file: `${repoPath}/.reviewer/comments.json`,
  }))

  const read: CommentsRepo["list"] = Effect.gen(function* () {
    const { file } = yield* commentsFile
    const present = yield* fs.exists(file).pipe(Effect.mapError(toStorageError))
    if (!present) return []
    const raw = yield* fs.readFileString(file).pipe(Effect.mapError(toStorageError))
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Array<ReviewComment>) : []
    } catch {
      return []
    }
  })

  const write = (comments: ReadonlyArray<ReviewComment>) =>
    Effect.gen(function* () {
      const { dir, file } = yield* commentsFile
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(toStorageError))
      yield* fs
        .writeFileString(file, JSON.stringify(comments, null, 2))
        .pipe(Effect.mapError(toStorageError))
    })

  let counter = 0

  const add: CommentsRepo["add"] = (comment) =>
    Effect.gen(function* () {
      const existing = yield* read
      counter += 1
      const created: ReviewComment = {
        ...comment,
        id: `c-${Date.now().toString(36)}-${counter}`,
        createdAt: new Date().toISOString(),
        source: "local",
      }
      yield* write([...existing, created])
      return created
    })

  const remove: CommentsRepo["remove"] = (id) =>
    Effect.gen(function* () {
      const existing = yield* read
      yield* write(existing.filter((comment) => comment.id !== id))
    })

  return { list: read, add, remove } satisfies CommentsRepo
})
