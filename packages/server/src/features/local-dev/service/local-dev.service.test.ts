import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { LocalDevMemory } from "../layer/local-dev.layer.memory.ts"
import { LocalDevService } from "./local-dev.service.ts"

describe("LocalDevService", () => {
  it.effect("create trims input, stamps an id, and lists it back", () =>
    Effect.gen(function* () {
      const dev = yield* LocalDevService
      const created = yield* dev.create({
        name: "  web  ",
        command: "  pnpm dev  ",
      })
      expect(created.id).not.toBe("")
      expect(created.name).toBe("web")
      expect(created.command).toBe("pnpm dev")
      const all = yield* dev.list
      expect(all.map((c) => c.id)).toContain(created.id)
    }).pipe(Effect.provide(LocalDevMemory()))
  )

  it.effect("update changes given fields and leaves the rest", () =>
    Effect.gen(function* () {
      const dev = yield* LocalDevService
      const created = yield* dev.create({ name: "web", command: "pnpm dev" })
      const updated = yield* dev.update(created.id, { command: "pnpm start" })
      expect(updated.name).toBe("web")
      expect(updated.command).toBe("pnpm start")
    }).pipe(Effect.provide(LocalDevMemory()))
  )

  it.effect("get fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const dev = yield* LocalDevService
      const result = yield* Effect.flip(dev.get("nope"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(LocalDevMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const dev = yield* LocalDevService
      const created = yield* dev.create({ name: "web", command: "pnpm dev" })
      yield* dev.remove(created.id)
      const all = yield* dev.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(LocalDevMemory()))
  )
})
