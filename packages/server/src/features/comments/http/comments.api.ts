import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { NoRepoSelected, StorageError } from "../../../layers/errors.ts"
import { Ok, ReviewComment } from "../schema/comments.schema.model.ts"
import { CommentIdParam, NewComment } from "../schema/comments.schema.requests.ts"

const storeError = [NoRepoSelected, StorageError] as const

export class CommentsApi extends HttpApiGroup.make("comments")
  .add(
    HttpApiEndpoint.get("list", "/comments", {
      success: Schema.Array(ReviewComment),
      error: storeError,
    }),
  )
  .add(
    HttpApiEndpoint.post("add", "/comments", {
      payload: NewComment,
      success: ReviewComment,
      error: storeError,
    }),
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/comments/:id", {
      params: CommentIdParam,
      success: Ok,
      error: storeError,
    }),
  ) {}
