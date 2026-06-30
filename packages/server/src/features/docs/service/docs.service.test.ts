import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { DocsMemory } from "../layer/docs.layer.memory.ts"
import { DocsService } from "./docs.service.ts"

describe("DocsService", () => {
  it.effect("create slugs the title and seeds a heading", () =>
    Effect.gen(function* () {
      const docs = yield* DocsService
      const created = yield* docs.create("Migration Plan")
      expect(created.id).toBe("migration-plan")
      expect(created.title).toBe("Migration Plan")
      expect(created.content).toContain("# Migration Plan")
    }).pipe(Effect.provide(DocsMemory()))
  )

  it.effect("update rewrites content and re-derives the title", () =>
    Effect.gen(function* () {
      const docs = yield* DocsService
      const created = yield* docs.create("Draft")
      const updated = yield* docs.update(created.id, "# Renamed\n\nstep one\n")
      expect(updated.title).toBe("Renamed")
      const fetched = yield* docs.get(created.id)
      expect(fetched.content).toContain("step one")
    }).pipe(Effect.provide(DocsMemory()))
  )

  it.effect("get fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const docs = yield* DocsService
      const result = yield* Effect.flip(docs.get("missing"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(DocsMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const docs = yield* DocsService
      const created = yield* docs.create("Temp")
      yield* docs.remove(created.id)
      const all = yield* docs.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(DocsMemory()))
  )
})
