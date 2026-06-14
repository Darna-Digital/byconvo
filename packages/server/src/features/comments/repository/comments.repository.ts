/** Local review-comment store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { NoRepoSelected, StorageError } from "../../../layers/errors.ts"
import type { CommentSide, ReviewComment } from "../schema/comments.schema.model.ts"

export interface AddCommentInput {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
  readonly body: string
  readonly author: string
  readonly target: string
}

export type CommentsFailure = NoRepoSelected | StorageError

export interface CommentsRepo {
  readonly list: Effect.Effect<ReadonlyArray<ReviewComment>, CommentsFailure>
  readonly add: (input: AddCommentInput) => Effect.Effect<ReviewComment, CommentsFailure>
  readonly remove: (id: string) => Effect.Effect<void, CommentsFailure>
}

export class CommentsRepository extends Context.Service<CommentsRepository, CommentsRepo>()(
  "CommentsRepository",
) {}
