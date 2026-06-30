import * as Schema from "effect/Schema"

export const NewDevCommand = Schema.Struct({
  name: Schema.String,
  command: Schema.String,
})
export type NewDevCommand = typeof NewDevCommand.Type

export const UpdateDevCommand = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  command: Schema.optionalKey(Schema.String),
})
export type UpdateDevCommand = typeof UpdateDevCommand.Type

export const DevCommandIdParam = Schema.Struct({ id: Schema.String })
