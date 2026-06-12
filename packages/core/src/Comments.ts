/**
 * Comments service — inline review comments persisted to
 * `.codediff/comments.json` inside the currently selected repository.
 */
import { Context, Effect, Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"
import type { CommentSide, ReviewComment } from "./domain.js"
import { NoRepoSelected, Workspace } from "./Workspace.js"

export interface NewComment {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
  readonly body: string
  readonly author: string
  readonly target: string
}

export type CommentsFailure = NoRepoSelected | PlatformError

export interface CommentsShape {
  readonly list: Effect.Effect<ReadonlyArray<ReviewComment>, CommentsFailure>
  readonly add: (comment: NewComment) => Effect.Effect<ReviewComment, CommentsFailure>
  readonly remove: (id: string) => Effect.Effect<void, CommentsFailure>
}

export class Comments extends Context.Service<Comments, CommentsShape>()("Comments") {}

export const make = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const workspace = yield* Workspace

  const commentsFile = Effect.map(
    workspace.requireCurrent,
    (repoPath) => ({ dir: `${repoPath}/.codediff`, file: `${repoPath}/.codediff/comments.json` })
  )

  const read: Effect.Effect<Array<ReviewComment>, CommentsFailure> = Effect.gen(function*() {
    const { file } = yield* commentsFile
    const present = yield* fs.exists(file)
    if (!present) return []
    const raw = yield* fs.readFileString(file)
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed as Array<ReviewComment> : []
    } catch {
      return []
    }
  })

  const write = (comments: ReadonlyArray<ReviewComment>) =>
    Effect.gen(function*() {
      const { dir, file } = yield* commentsFile
      yield* fs.makeDirectory(dir, { recursive: true })
      yield* fs.writeFileString(file, JSON.stringify(comments, null, 2))
    })

  let counter = 0

  const add: CommentsShape["add"] = (comment) =>
    Effect.gen(function*() {
      const existing = yield* read
      counter += 1
      const created: ReviewComment = {
        ...comment,
        id: `c-${Date.now().toString(36)}-${counter}`,
        createdAt: new Date().toISOString(),
        source: "local"
      }
      yield* write([...existing, created])
      return created
    })

  const remove: CommentsShape["remove"] = (id) =>
    Effect.gen(function*() {
      const existing = yield* read
      yield* write(existing.filter((comment) => comment.id !== id))
    })

  return Comments.of({ list: read, add, remove })
})

export const layer: Layer.Layer<Comments, never, FileSystem.FileSystem | Workspace> =
  Layer.effect(Comments)(make)
