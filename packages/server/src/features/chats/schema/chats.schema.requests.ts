import * as Schema from "effect/Schema"
import { ChatAgent } from "./chats.schema.model.ts"

export const NewChat = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  agent: Schema.optionalKey(ChatAgent),
  branch: Schema.optionalKey(Schema.String),
  taskKey: Schema.optionalKey(Schema.String),
  initialPrompt: Schema.optionalKey(Schema.String),
})
export type NewChat = typeof NewChat.Type

export const RenameChat = Schema.Struct({
  title: Schema.String,
  branch: Schema.optionalKey(Schema.String),
  taskKey: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type RenameChat = typeof RenameChat.Type

export const ChatIdParam = Schema.Struct({ id: Schema.String })
