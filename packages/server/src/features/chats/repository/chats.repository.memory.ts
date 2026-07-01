/** In-memory ACP-chat store for tests. Mirrors threads.repository.memory.ts. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import {
  applyRename,
  createChat,
  summarize,
  type CreateChatInput,
  type RenameChatInput,
} from "../store/chats-ops.ts"
import type { Chat } from "../schema/chats.schema.model.ts"
import type { ChatsRepo } from "./chats.repository.ts"

export const makeMemoryChatsRepository = (seed: ReadonlyArray<Chat> = []) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Chat>>([...seed])
    let counter = 0
    const nextId = () => {
      counter += 1
      return `c-mem-${counter}`
    }
    const now = () => "2026-01-01T00:00:00.000Z"

    const find = (chats: ReadonlyArray<Chat>, id: string) => {
      const chat = chats.find((c) => c.id === id)
      if (chat === undefined) {
        return Effect.fail(new NotFound({ reason: `chat ${id} not found` }))
      }
      return Effect.succeed(chat)
    }

    const repo: ChatsRepo = {
      list: Ref.get(store).pipe(
        Effect.map((chats) =>
          [...chats]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map(summarize)
        )
      ),
      get: (id) => Effect.flatMap(Ref.get(store), (chats) => find(chats, id)),
      create: (input: CreateChatInput) =>
        Effect.gen(function* () {
          const created = createChat(input, nextId(), now())
          yield* Ref.update(store, (all) => [created, ...all])
          return created
        }),
      rename: (id, input: RenameChatInput) =>
        Effect.gen(function* () {
          const existing = yield* find(yield* Ref.get(store), id)
          const updated = applyRename(existing, input, now())
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.id === id ? updated : c))
          )
          return updated
        }),
      remove: (id) =>
        Ref.update(store, (all) => all.filter((c) => c.id !== id)),
    }
    return repo
  })
