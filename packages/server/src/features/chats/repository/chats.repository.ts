/** Local ACP-chat store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import type { Chat, ChatSummary } from "../schema/chats.schema.model.ts"
import type { CreateChatInput, RenameChatInput } from "../store/chats-ops.ts"

export type { CreateChatInput, RenameChatInput }

export type ChatsFailure = NoRepoSelected | NotFound | StorageError

export interface ChatsRepo {
  readonly list: Effect.Effect<ReadonlyArray<ChatSummary>, ChatsFailure>
  readonly get: (id: string) => Effect.Effect<Chat, ChatsFailure>
  readonly create: (input: CreateChatInput) => Effect.Effect<Chat, ChatsFailure>
  readonly rename: (
    id: string,
    input: RenameChatInput
  ) => Effect.Effect<Chat, ChatsFailure>
  readonly remove: (id: string) => Effect.Effect<void, ChatsFailure>
}

export class ChatsRepository extends Context.Service<
  ChatsRepository,
  ChatsRepo
>()("ChatsRepository") {}
