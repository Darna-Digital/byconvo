import * as Schema from "effect/Schema"
import { KanbanColumn } from "./kanban.schema.model.ts"

export const NewCard = Schema.Struct({
  title: Schema.String,
  description: Schema.optionalKey(Schema.String),
  column: Schema.optionalKey(KanbanColumn),
})
export type NewCard = typeof NewCard.Type

export const UpdateCard = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  column: Schema.optionalKey(KanbanColumn),
  order: Schema.optionalKey(Schema.Number),
})
export type UpdateCard = typeof UpdateCard.Type

export const CardIdParam = Schema.Struct({ id: Schema.String })

/** A free-form task reference: a key ("DAR-123"), a phrase, or a title. */
export const TaskRefParam = Schema.Struct({ ref: Schema.String })

export const SetPrefix = Schema.Struct({ prefix: Schema.String })
export type SetPrefix = typeof SetPrefix.Type
