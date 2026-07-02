/**
 * ChatsService — repository CRUD plus turn control. A "send" appends nothing
 * itself: it validates (chat exists, not busy, non-blank prompt) and hands the
 * turn to the ChatRuntime, which persists the user message + streaming
 * assistant placeholder and broadcasts progress over the chat WebSocket. The
 * returned Chat already contains both messages, so the caller can render the
 * turn immediately even before the socket delivers its first event.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { ChatBusy, NotFound } from "../../../layers/errors.ts"
import { CHAT_MODEL_CATALOG } from "../providers.ts"
import {
  ChatsRepository,
  type ChatsFailure,
  type ChatsRepo,
} from "../repository/chats.repository.ts"
import { ChatRuntime } from "../runtime/chats.runtime.service.ts"
import type { Chat, ChatModelCatalog } from "../schema/chats.schema.model.ts"

export interface ChatsServiceShape extends ChatsRepo {
  /** Start a turn with `text`; blank input is a no-op returning the chat. */
  readonly send: (id: string, text: string) => Effect.Effect<Chat, ChatsFailure>
  /** Interrupt the running turn; `ran` is false when nothing was running. */
  readonly stop: (
    id: string
  ) => Effect.Effect<{ readonly ok: boolean }, ChatsFailure>
  readonly models: Effect.Effect<ChatModelCatalog>
}

export class ChatsService extends Context.Service<
  ChatsService,
  ChatsServiceShape
>()("ChatsService") {}

export const make = Effect.gen(function* () {
  const repo = yield* ChatsRepository
  const runtime = yield* ChatRuntime

  const send: ChatsServiceShape["send"] = (id, text) =>
    Effect.gen(function* () {
      const prompt = text.trim()
      const chat = yield* repo.get(id)
      if (prompt.length === 0) return chat
      if (yield* runtime.isRunning(id)) {
        return yield* Effect.fail(new ChatBusy({ chatId: id }))
      }
      const result = yield* runtime.start(id, prompt)
      if (!result.ok) {
        return yield* Effect.fail(
          result.reason === "busy"
            ? new ChatBusy({ chatId: id })
            : new NotFound({ reason: `chat ${id} not found` })
        )
      }
      // Re-read: the runtime just persisted the user + assistant messages.
      return yield* repo.get(id)
    })

  const stop: ChatsServiceShape["stop"] = (id) =>
    Effect.gen(function* () {
      yield* repo.get(id) // 404 for an unknown chat
      const ran = yield* runtime.stop(id)
      return { ok: ran }
    })

  const remove: ChatsServiceShape["remove"] = (id) =>
    // Tear down the live turn/sockets so a deleted chat leaves no orphans.
    Effect.flatMap(repo.remove(id), () => runtime.kill(id))

  const update: ChatsServiceShape["update"] = (id, input) =>
    // Push the patched settings (model/provider/effort/…) to open composers so
    // an agent switch shows up live instead of after the next turn.
    Effect.tap(repo.update(id, input), () => runtime.broadcastSnapshot(id))

  return ChatsService.of({
    ...repo,
    update,
    remove,
    send,
    stop,
    models: Effect.succeed(CHAT_MODEL_CATALOG),
  })
})
