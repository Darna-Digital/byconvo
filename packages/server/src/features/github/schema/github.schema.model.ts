/** GitHub pull-request schemas. Review comments reuse the comments feature's
 * shape (with source="github"). */
import * as Schema from "effect/Schema"

export { ReviewComment } from "../../comments/schema/comments.schema.model.ts"

export const PullRequestInfo = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  author: Schema.String,
  baseRef: Schema.String,
  headRef: Schema.String,
  headSha: Schema.String,
  url: Schema.String,
  updatedAt: Schema.String,
})
export type PullRequestInfo = typeof PullRequestInfo.Type

export const DiffText = Schema.String
