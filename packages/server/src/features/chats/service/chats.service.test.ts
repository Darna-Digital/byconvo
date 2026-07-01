import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { ChatsMemory } from "../layer/chats.layer.memory.ts"
import { ChatsService } from "./chats.service.ts"

describe("ChatsService", () => {
  it.effect("create stamps an id + agent-default title and lists it back", () =>
    Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create({
        title: "",
        agent: "claude",
        branch: "main",
        taskKey: null,
        initialPrompt: "",
      })
      expect(created.id).not.toBe("")
      expect(created.title).toBe("Claude Code")
      expect(created.agent).toBe("claude")
      expect(created.messages).toHaveLength(0)
      const all = yield* chats.list
      expect(all.map((c) => c.id)).toContain(created.id)
      expect(all[0].messageCount).toBe(0)
    }).pipe(Effect.provide(ChatsMemory()))
  )

  it.effect(
    "a custom title is kept; codex/opencode get their own defaults",
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatsService
        const named = yield* chats.create({
          title: "Fix the parser",
          agent: "codex",
          branch: "main",
          taskKey: null,
          initialPrompt: "",
        })
        expect(named.title).toBe("Fix the parser")
        const oc = yield* chats.create({
          title: "",
          agent: "opencode",
          branch: "main",
          taskKey: null,
          initialPrompt: "",
        })
        expect(oc.title).toBe("opencode")
      }).pipe(Effect.provide(ChatsMemory()))
  )

  it.effect("rename changes the title and can move the branch", () =>
    Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create({
        title: "",
        agent: "claude",
        branch: "main",
        taskKey: null,
        initialPrompt: "",
      })
      const renamed = yield* chats.rename(created.id, {
        title: "Renamed",
        branch: "feature",
      })
      expect(renamed.title).toBe("Renamed")
      expect(renamed.branch).toBe("feature")
      // A blank title keeps the existing one; an undefined branch is untouched.
      const again = yield* chats.rename(created.id, { title: "" })
      expect(again.title).toBe("Renamed")
      expect(again.branch).toBe("feature")
    }).pipe(Effect.provide(ChatsMemory()))
  )

  it.effect("get fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const chats = yield* ChatsService
      const result = yield* Effect.flip(chats.get("nope"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(ChatsMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const chats = yield* ChatsService
      const created = yield* chats.create({
        title: "work",
        agent: "claude",
        branch: "main",
        taskKey: null,
        initialPrompt: "",
      })
      yield* chats.remove(created.id)
      const all = yield* chats.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(ChatsMemory()))
  )
})
