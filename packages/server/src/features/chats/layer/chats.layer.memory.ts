import * as Layer from "effect/Layer"
import { ChatsRepository } from "../repository/chats.repository.ts"
import { makeMemoryChatsRepository } from "../repository/chats.repository.memory.ts"
import { ChatsService, make } from "../service/chats.service.ts"
import type { Chat } from "../schema/chats.schema.model.ts"

export const ChatsMemory = (seed: ReadonlyArray<Chat> = []) =>
  Layer.effect(ChatsService)(make).pipe(
    Layer.provide(
      Layer.effect(ChatsRepository)(makeMemoryChatsRepository(seed))
    )
  )
