import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { ThreadsMemory } from "../layer/threads.layer.memory.ts"
import { ThreadsService } from "./threads.service.ts"

describe("ThreadsService", () => {
  it.effect("create stamps an id + default title and lists it back", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({ title: "", taskKey: null })
      expect(created.id).not.toBe("")
      expect(created.title).toBe("New thread")
      const all = yield* threads.list
      expect(all.map((t) => t.id)).toContain(created.id)
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("run records the command and renames the default thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({ title: "", taskKey: null })
      const entry = yield* threads.run(created.id, "echo hi")
      expect(entry.command).toBe("echo hi")
      expect(entry.exitCode).toBe(0)
      const full = yield* threads.get(created.id)
      expect(full.entries).toHaveLength(1)
      // Title reflects what's running once it leaves the default state.
      expect(full.title).toBe("echo")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("get fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const result = yield* Effect.flip(threads.get("nope"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({ title: "work", taskKey: null })
      yield* threads.remove(created.id)
      const all = yield* threads.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(ThreadsMemory()))
  )
})
