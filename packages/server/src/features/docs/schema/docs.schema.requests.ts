import * as Schema from "effect/Schema"

export const NewDoc = Schema.Struct({
  title: Schema.String,
})
export type NewDoc = typeof NewDoc.Type

export const UpdateDoc = Schema.Struct({
  content: Schema.String,
})
export type UpdateDoc = typeof UpdateDoc.Type

export const DocIdParam = Schema.Struct({ id: Schema.String })
