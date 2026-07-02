import * as Schema from "effect/Schema"
import {
  ChatAccess,
  ChatEffort,
  ChatMode,
  ChatProviderKind,
} from "./chats.schema.model.ts"

export const NewChat = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  provider: Schema.optionalKey(ChatProviderKind),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(ChatEffort),
  access: Schema.optionalKey(ChatAccess),
  mode: Schema.optionalKey(ChatMode),
  branch: Schema.optionalKey(Schema.String),
})
export type NewChat = typeof NewChat.Type

/** Every field optional — a settings/title patch from the composer. */
export const UpdateChat = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(ChatEffort),
  access: Schema.optionalKey(ChatAccess),
  mode: Schema.optionalKey(ChatMode),
})
export type UpdateChat = typeof UpdateChat.Type

export const SendChatMessage = Schema.Struct({
  text: Schema.String,
})
export type SendChatMessage = typeof SendChatMessage.Type

export const ChatIdParam = Schema.Struct({ id: Schema.String })
