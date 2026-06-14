import * as Schema from "effect/Schema"
import { CommentSide } from "./comments.schema.model.ts"

export const NewComment = Schema.Struct({
  filePath: Schema.String,
  side: CommentSide,
  lineNumber: Schema.Number,
  body: Schema.String,
  author: Schema.optionalKey(Schema.String),
  target: Schema.optionalKey(Schema.String),
})
export type NewComment = typeof NewComment.Type

export const CommentIdParam = Schema.Struct({ id: Schema.String })
