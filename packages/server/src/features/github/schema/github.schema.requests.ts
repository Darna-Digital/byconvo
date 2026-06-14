import * as Schema from "effect/Schema"
import { CommentSide } from "../../comments/schema/comments.schema.model.ts"

export const PullNumberParam = Schema.Struct({ number: Schema.String })

export const PullReplyParams = Schema.Struct({
  number: Schema.String,
  commentId: Schema.String,
})

export const PrComment = Schema.Struct({
  filePath: Schema.String,
  side: CommentSide,
  lineNumber: Schema.Number,
  body: Schema.String,
})
export type PrComment = typeof PrComment.Type

export const PrReply = Schema.Struct({ body: Schema.String })

/** The structured PR-comment input the repository consumes. */
export interface PrCommentInput {
  readonly pullNumber: number
  readonly filePath: string
  readonly side: "deletions" | "additions"
  readonly lineNumber: number
  readonly body: string
}

export interface PrReplyInput {
  readonly pullNumber: number
  readonly commentId: number
  readonly body: string
}
