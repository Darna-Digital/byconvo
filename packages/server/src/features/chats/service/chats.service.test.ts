import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { ChatsMemory } from "../layer/chats.layer.memory.ts"
import { CHAT_MODEL_CATALOG } from "../providers.ts"
import { ChatsService } from "./chats.service.ts"

const newChat = {
  title: "",
  provider: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  access: "fullAccess",
  mode: "build",
  branch: "main",
} as const

describe("ChatsService", () => {
  it.effect("create stamps an id + default title and lists it back", () => {
    const { layer } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      expect(created.id).not.toBe("")
      expect(created.title).toBe("New thread")
      expect(created.sessionId).toBeNull()
      const all = yield* chats.list
      expect(all.map((c) => c.id)).toContain(created.id)
    }).pipe(Effect.provide(layer))
  })

  it.effect("send trims the prompt and hands the turn to the runtime", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      yield* chats.send(created.id, "  explain this repo  ")
      expect(runtime.calls.start).toEqual([
        { chatId: created.id, text: "explain this repo" },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect("send with a blank prompt is a no-op returning the chat", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      const result = yield* chats.send(created.id, "   ")
      expect(result.id).toBe(created.id)
      expect(runtime.calls.start).toHaveLength(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("send fails with ChatBusy while a turn is running", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      runtime.state.running.add(created.id)
      const failure = yield* Effect.flip(chats.send(created.id, "again"))
      expect(failure._tag).toBe("ChatBusy")
      expect(runtime.calls.start).toHaveLength(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("send surfaces a runtime busy race as ChatBusy", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      runtime.state.startResult = { ok: false, reason: "busy" }
      const failure = yield* Effect.flip(chats.send(created.id, "go"))
      expect(failure._tag).toBe("ChatBusy")
    }).pipe(Effect.provide(layer))
  })

  it.effect("send to an unknown chat fails with NotFound", () => {
    const { layer } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const failure = yield* Effect.flip(chats.send("nope", "hello"))
      expect(failure._tag).toBe("NotFound")
    }).pipe(Effect.provide(layer))
  })

  it.effect("stop interrupts through the runtime", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      runtime.state.running.add(created.id)
      const result = yield* chats.stop(created.id)
      expect(result.ok).toBe(true)
      expect(runtime.calls.stop).toEqual([created.id])
    }).pipe(Effect.provide(layer))
  })

  it.effect("update patches settings without touching the title", () => {
    const { layer } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create({ ...newChat, title: "My chat" })
      const updated = yield* chats.update(created.id, {
        model: "claude-fable-5",
        effort: "low",
        mode: "plan",
      })
      expect(updated.title).toBe("My chat")
      expect(updated.model).toBe("claude-fable-5")
      expect(updated.effort).toBe("low")
      expect(updated.mode).toBe("plan")
      expect(updated.access).toBe("fullAccess")
    }).pipe(Effect.provide(layer))
  })

  it.effect("remove deletes the chat and tears down its runtime", () => {
    const { layer, runtime } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create(newChat)
      yield* chats.remove(created.id)
      expect(runtime.calls.kill).toEqual([created.id])
      const all = yield* chats.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("models returns the static catalog with defaults", () => {
    const { layer } = ChatsMemory()
    return Effect.gen(function* () {
      const chats = yield* ChatsService
      const catalog = yield* chats.models
      expect(catalog).toEqual(CHAT_MODEL_CATALOG)
      expect(
        catalog.providers.flatMap((p) => p.models).map((m) => m.id)
      ).toContain(catalog.defaults.model)
    }).pipe(Effect.provide(layer))
  })
})
