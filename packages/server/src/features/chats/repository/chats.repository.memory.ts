/** In-memory chat store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import type { Chat } from "../schema/chats.schema.model.ts"
import { DEFAULT_CHAT_TITLE, summarizeChat } from "../store.ts"
import type {
  ChatsRepo,
  CreateChatInput,
  UpdateChatInput,
} from "./chats.repository.ts"

export const makeMemoryChatsRepository = (seed: ReadonlyArray<Chat> = []) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Chat>>([...seed])
    let counter = 0
    const nextId = (prefix: string) => {
      counter += 1
      return `${prefix}-mem-${counter}`
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
        Effect.map((chats) => chats.map(summarizeChat))
      ),
      get: (id) => Effect.flatMap(Ref.get(store), (chats) => find(chats, id)),
      create: (input: CreateChatInput) =>
        Effect.gen(function* () {
          const created: Chat = {
            id: nextId("c"),
            title:
              input.title.trim().length > 0
                ? input.title.trim()
                : DEFAULT_CHAT_TITLE,
            provider: input.provider,
            model: input.model,
            effort: input.effort,
            access: input.access,
            mode: input.mode,
            branch: input.branch,
            sessionId: null,
            createdAt: now(),
            updatedAt: now(),
            messages: [],
            activities: [],
            latestTurn: null,
          }
          yield* Ref.update(store, (all) => [created, ...all])
          return created
        }),
      update: (id, input: UpdateChatInput) =>
        Effect.gen(function* () {
          const existing = yield* find(yield* Ref.get(store), id)
          const provider = input.provider ?? existing.provider
          const providerChanged = provider !== existing.provider
          const updated: Chat = {
            ...existing,
            title:
              input.title !== undefined && input.title.trim().length > 0
                ? input.title.trim()
                : existing.title,
            provider,
            model: input.model ?? (providerChanged ? "" : existing.model),
            effort: input.effort ?? existing.effort,
            access: input.access ?? existing.access,
            mode: input.mode ?? existing.mode,
            sessionId: providerChanged ? null : existing.sessionId,
            updatedAt: now(),
          }
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
