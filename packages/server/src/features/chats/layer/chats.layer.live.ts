import * as Layer from "effect/Layer"
import { ChatsRepository } from "../repository/chats.repository.ts"
import { makeFileChatsRepository } from "../repository/chats.repository.file.ts"
import { liveLayer as chatRuntimeLive } from "../runtime/chats.runtime.service.ts"
import { ChatsService, make } from "../service/chats.service.ts"

export const ChatsLive = Layer.effect(ChatsService)(make).pipe(
  Layer.provide(Layer.effect(ChatsRepository)(makeFileChatsRepository)),
  Layer.provide(chatRuntimeLive)
)
