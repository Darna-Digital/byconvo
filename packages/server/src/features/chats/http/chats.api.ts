import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import { Chat, ChatSummary, Ok } from "../schema/chats.schema.model.ts"
import {
  ChatIdParam,
  NewChat,
  RenameChat,
} from "../schema/chats.schema.requests.ts"

const errors = [NoRepoSelected, NotFound, StorageError] as const

export class ChatsApi extends HttpApiGroup.make("chats")
  .add(
    HttpApiEndpoint.get("list", "/chats", {
      success: Schema.Array(ChatSummary),
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/chats", {
      payload: NewChat,
      success: Chat,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/chats/:id", {
      params: ChatIdParam,
      success: Chat,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PATCH")("rename", "/chats/:id", {
      params: ChatIdParam,
      payload: RenameChat,
      success: Chat,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/chats/:id", {
      params: ChatIdParam,
      success: Ok,
      error: errors,
    })
  ) {}
