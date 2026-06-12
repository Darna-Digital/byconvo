/**
 * Comments service — inline review comments persisted to
 * `.codediff/comments.json` inside the reviewed repository.
 */
import { Context, Effect, Layer } from "effect"
import * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"
import type { CommentSide, ReviewComment } from "./domain.js"

export interface NewComment {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
  readonly body: string
  readonly author: string
  readonly target: string
}

export interface CommentsShape {
  readonly list: Effect.Effect<ReadonlyArray<ReviewComment>, PlatformError>
  readonly add: (comment: NewComment) => Effect.Effect<ReviewComment, PlatformError>
  readonly remove: (id: string) => Effect.Effect<void, PlatformError>
}

export class Comments extends Context.Service<Comments, CommentsShape>()("Comments") {}

export const make = (repoPath: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = `${repoPath}/.codediff`
    const file = `${dir}/comments.json`

    const read: Effect.Effect<Array<ReviewComment>, PlatformError> = Effect.gen(function*() {
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

export const layer = (repoPath: string): Layer.Layer<Comments, never, FileSystem.FileSystem> =>
  Layer.effect(Comments)(make(repoPath))
