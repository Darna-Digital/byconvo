/** Request payloads / query params for the workspace endpoints. */
import * as Schema from "effect/Schema"

export const SetWorkspace = Schema.Struct({
  path: Schema.String,
})
export type SetWorkspace = typeof SetWorkspace.Type

export const WriteFile = Schema.Struct({
  path: Schema.String,
  contents: Schema.String,
})
export type WriteFile = typeof WriteFile.Type

export const RenameFile = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
})
export type RenameFile = typeof RenameFile.Type

/** `?path=` is optional for browse (defaults to home), required for file ops. */
export const BrowseQuery = Schema.Struct({
  path: Schema.optionalKey(Schema.String),
})

export const PathQuery = Schema.Struct({
  path: Schema.String,
})
