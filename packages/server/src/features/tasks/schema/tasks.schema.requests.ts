import * as Schema from "effect/Schema"
import { TasksColumn } from "./tasks.schema.model.ts"

export const NewCard = Schema.Struct({
  title: Schema.String,
  description: Schema.optionalKey(Schema.String),
  column: Schema.optionalKey(TasksColumn),
})
export type NewCard = typeof NewCard.Type

export const UpdateCard = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  column: Schema.optionalKey(TasksColumn),
  order: Schema.optionalKey(Schema.Number),
})
export type UpdateCard = typeof UpdateCard.Type

export const CardIdParam = Schema.Struct({ id: Schema.String })

/** A free-form task reference: a key ("DAR-123"), a phrase, or a title. */
export const TaskRefParam = Schema.Struct({ ref: Schema.String })

export const SetPrefix = Schema.Struct({ prefix: Schema.String })
export type SetPrefix = typeof SetPrefix.Type

export const NewColumn = Schema.Struct({ name: Schema.String })
export type NewColumn = typeof NewColumn.Type

export const UpdateColumn = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  order: Schema.optionalKey(Schema.Number),
})
export type UpdateColumn = typeof UpdateColumn.Type

export const ColumnIdParam = Schema.Struct({ id: Schema.String })

export const NewComment = Schema.Struct({
  body: Schema.String,
  /** When set, this comment is a reply to the given comment id. */
  parentId: Schema.optionalKey(Schema.String),
})
export type NewComment = typeof NewComment.Type

export const CommentIdParam = Schema.Struct({ commentId: Schema.String })

/** Card id + comment id, for operating on one comment of a card. */
export const CardCommentParams = Schema.Struct({
  id: Schema.String,
  commentId: Schema.String,
})
