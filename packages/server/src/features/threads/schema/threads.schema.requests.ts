import * as Schema from "effect/Schema"

export const NewThread = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  taskKey: Schema.optionalKey(Schema.String),
})
export type NewThread = typeof NewThread.Type

export const RenameThread = Schema.Struct({
  title: Schema.String,
  taskKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type RenameThread = typeof RenameThread.Type

export const RunCommand = Schema.Struct({
  command: Schema.String,
})
export type RunCommand = typeof RunCommand.Type

export const ThreadIdParam = Schema.Struct({ id: Schema.String })
