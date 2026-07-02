import * as Layer from "effect/Layer"
import { ChatsRepository } from "../repository/chats.repository.ts"
import { makeMemoryChatsRepository } from "../repository/chats.repository.memory.ts"
import {
  memoryChatRuntime,
  type MemoryChatRuntime,
} from "../runtime/chats.runtime.service.ts"
import { ChatsService, make } from "../service/chats.service.ts"
import type { Chat } from "../schema/chats.schema.model.ts"

/** The memory service layer plus the runtime recorder, for assertions. */
export const ChatsMemory = (seed: ReadonlyArray<Chat> = []) => {
  const runtime = memoryChatRuntime()
  const layer = Layer.effect(ChatsService)(make).pipe(
    Layer.provide(
      Layer.effect(ChatsRepository)(makeMemoryChatsRepository(seed))
    ),
    Layer.provide(runtime.layer)
  )
  return { layer, runtime }
}
