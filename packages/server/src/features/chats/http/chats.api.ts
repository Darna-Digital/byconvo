import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  ChatBusy,
  NoRepoSelected,
  NotFound,
  StorageError,
  TerminalError,
} from "../../../layers/errors.ts"
import {
  Chat,
  ChatModelCatalog,
  ChatSummary,
  Ok,
} from "../schema/chats.schema.model.ts"
import {
  ChatIdParam,
  NewChat,
  SendChatMessage,
  UpdateChat,
} from "../schema/chats.schema.requests.ts"

const errors = [
  NoRepoSelected,
  NotFound,
  StorageError,
  TerminalError,
  ChatBusy,
] as const

export class ChatsApi extends HttpApiGroup.make("chats")
  .add(
    HttpApiEndpoint.get("list", "/chats", {
      success: Schema.Array(ChatSummary),
      error: errors,
    })
  )
  .add(
    // The composer's model picker catalog. Registered before /chats/:id so
    // "models" never parses as a chat id.
    HttpApiEndpoint.get("models", "/chats/models", {
      success: ChatModelCatalog,
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
    HttpApiEndpoint.make("PATCH")("update", "/chats/:id", {
      params: ChatIdParam,
      payload: UpdateChat,
      success: Chat,
      error: errors,
    })
  )
  .add(
    // Starts a turn; progress streams over the chat WebSocket
    // (/api/chats/stream?chat=:id). Returns the chat with the new user
    // message and the streaming assistant placeholder already appended.
    HttpApiEndpoint.post("send", "/chats/:id/messages", {
      params: ChatIdParam,
      payload: SendChatMessage,
      success: Chat,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("stop", "/chats/:id/stop", {
      params: ChatIdParam,
      success: Ok,
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
