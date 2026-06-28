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
