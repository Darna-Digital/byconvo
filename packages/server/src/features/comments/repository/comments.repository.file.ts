/**
 * File-backed comment store — persists local review comments to
 * `.reviewer/comments.json` inside the selected repository.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import { ReviewComment } from "../schema/comments.schema.model.ts"
import type { CommentsRepo } from "./comments.repository.ts"

const CommentsFile = Schema.Array(ReviewComment)

const commentsPath = (repoPath: string) => `${repoPath}/.reviewer/comments.json`

const readComments = (repoPath: string): ReadonlyArray<ReviewComment> => {
  try {
    const raw = readFileSync(commentsPath(repoPath), "utf8")
    return Schema.decodeUnknownSync(CommentsFile)(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

const writeComments = (
  repoPath: string,
  comments: ReadonlyArray<ReviewComment>
) => {
  mkdirSync(`${repoPath}/.reviewer`, { recursive: true })
  writeFileSync(
    commentsPath(repoPath),
    `${JSON.stringify(comments, null, 2)}\n`
  )
}

// Module-scoped so ids stay unique even though the repository is built per
// request (a request-scoped closure counter would reset and could collide).
let counter = 0

export const makeFileCommentsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        catch: (error) =>
          new StorageError({
            reason: error instanceof Error ? error.message : String(error),
          }),
      })
    )

  const list: CommentsRepo["list"] = withFile((repoPath) =>
    [...readComments(repoPath)].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )
  )

  const add: CommentsRepo["add"] = (input) =>
    withFile((repoPath) => {
      counter += 1
      const created: ReviewComment = {
        ...input,
        id: `c-${Date.now().toString(36)}-${counter}`,
        createdAt: new Date().toISOString(),
        source: "local",
      }
      writeComments(repoPath, [...readComments(repoPath), created])
      return created
    })

  const remove: CommentsRepo["remove"] = (id) =>
    withFile((repoPath) => {
      writeComments(
        repoPath,
        readComments(repoPath).filter((comment) => comment.id !== id)
      )
    })

  return { list, add, remove } satisfies CommentsRepo
})
