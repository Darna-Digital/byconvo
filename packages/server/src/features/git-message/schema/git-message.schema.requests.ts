/** Request payloads / path params for the git-message endpoints. */
import * as Schema from "effect/Schema"

/** Generate a commit message for the given changed paths (empty = all). */
export const GenerateBody = Schema.Struct({
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

/** Create a new saved commit prefix. */
export const NewPrefix = Schema.Struct({
  value: Schema.String,
  description: Schema.optionalKey(Schema.String),
})
export type NewPrefix = typeof NewPrefix.Type

/** Update an existing saved commit prefix. */
export const UpdatePrefix = Schema.Struct({
  value: Schema.String,
  description: Schema.optionalKey(Schema.String),
})
export type UpdatePrefix = typeof UpdatePrefix.Type

export const PrefixIdParam = Schema.Struct({ id: Schema.String })
