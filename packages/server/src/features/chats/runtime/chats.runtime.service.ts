/**
 * ChatRuntime — the Effect seam over the module-level chat turn runtime, so
 * the ChatsService (and its tests) never touch real processes directly. The
 * live implementation delegates to chat-runtime.ts; tests provide a recorder.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { getCurrentRepo } from "../../../layers/workspace/current-repo.ts"
import {
  broadcastChatSnapshot,
  isTurnRunning,
  killChatRuntime,
  startChatTurn,
  stopChatTurn,
  type StartTurnResult,
} from "./chat-runtime.ts"

export interface ChatRuntimeShape {
  readonly isRunning: (chatId: string) => Effect.Effect<boolean>
  /** Start a turn in the currently selected repo (resolved by the runtime —
   * callers have already validated the chat exists there). */
  readonly start: (
    chatId: string,
    text: string
  ) => Effect.Effect<StartTurnResult>
  readonly stop: (chatId: string) => Effect.Effect<boolean>
  /** Full teardown (process + sockets) for a deleted chat. */
  readonly kill: (chatId: string) => Effect.Effect<void>
  /** Replay a fresh snapshot to watchers after an out-of-band settings patch. */
  readonly broadcastSnapshot: (chatId: string) => Effect.Effect<void>
}

export class ChatRuntime extends Context.Service<
  ChatRuntime,
  ChatRuntimeShape
>()("ChatRuntime") {}

export const liveLayer: Layer.Layer<ChatRuntime> = Layer.succeed(ChatRuntime)(
  ChatRuntime.of({
    isRunning: (chatId) => Effect.sync(() => isTurnRunning(chatId)),
    start: (chatId, text) =>
      Effect.sync(() => {
        const repoPath = getCurrentRepo()
        if (repoPath === null) return { ok: false, reason: "not-found" }
        return startChatTurn(repoPath, chatId, text)
      }),
    stop: (chatId) => Effect.sync(() => stopChatTurn(chatId)),
    kill: (chatId) => Effect.sync(() => killChatRuntime(chatId)),
    broadcastSnapshot: (chatId) =>
      Effect.sync(() => {
        const repoPath = getCurrentRepo()
        if (repoPath !== null) broadcastChatSnapshot(repoPath, chatId)
      }),
  })
)

export interface MemoryChatRuntime {
  readonly layer: Layer.Layer<ChatRuntime>
  readonly calls: {
    readonly start: Array<{ chatId: string; text: string }>
    readonly stop: string[]
    readonly kill: string[]
    readonly broadcastSnapshot: string[]
  }
  /** Mutate to simulate a running turn / a start failure. */
  readonly state: { running: Set<string>; startResult: StartTurnResult }
}

/** Test seam: records calls, never spawns anything. */
export const memoryChatRuntime = (): MemoryChatRuntime => {
  const calls: MemoryChatRuntime["calls"] = {
    start: [],
    stop: [],
    kill: [],
    broadcastSnapshot: [],
  }
  const state: MemoryChatRuntime["state"] = {
    running: new Set(),
    startResult: { ok: true },
  }
  const layer = Layer.succeed(ChatRuntime)(
    ChatRuntime.of({
      isRunning: (chatId) => Effect.sync(() => state.running.has(chatId)),
      start: (chatId, text) =>
        Effect.sync(() => {
          calls.start.push({ chatId, text })
          return state.startResult
        }),
      stop: (chatId) =>
        Effect.sync(() => {
          calls.stop.push(chatId)
          return state.running.delete(chatId)
        }),
      kill: (chatId) =>
        Effect.sync(() => {
          calls.kill.push(chatId)
          state.running.delete(chatId)
        }),
      broadcastSnapshot: (chatId) =>
        Effect.sync(() => {
          calls.broadcastSnapshot.push(chatId)
        }),
    })
  )
  return { layer, calls, state }
}
