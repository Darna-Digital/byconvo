import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { WorkspaceMemory } from "../layer/workspace.layer.memory.ts"
import { WorkspaceService } from "./workspace.service.ts"

describe("WorkspaceService", () => {
  it.effect("info reflects the seeded selection", () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceService
      const info = yield* ws.info
      expect(info.current).toBe("/repo")
      expect(info.isGitRepo).toBe(true)
    }).pipe(Effect.provide(WorkspaceMemory({ current: "/repo" }))),
  )

  it.effect("setCurrent updates current and prepends to recents", () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceService
      const info = yield* ws.setCurrent("/another")
      expect(info.current).toBe("/another")
      expect(info.recents[0]).toBe("/another")
    }).pipe(Effect.provide(WorkspaceMemory({ current: "/repo", recents: ["/repo"] }))),
  )

  it.effect("readFile fails with NoRepoSelected when nothing is selected", () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceService
      const error = yield* Effect.flip(ws.readFile("a.ts"))
      expect((error as { _tag: string })._tag).toBe("NoRepoSelected")
    }).pipe(Effect.provide(WorkspaceMemory({ current: null }))),
  )

  it.effect("writeFile then readFile round-trips contents", () =>
    Effect.gen(function* () {
      const ws = yield* WorkspaceService
      yield* ws.writeFile("src/x.ts", "hello")
      const file = yield* ws.readFile("src/x.ts")
      expect(file.contents).toBe("hello")
      expect(file.name).toBe("x.ts")
    }).pipe(Effect.provide(WorkspaceMemory({ current: "/repo" }))),
  )
})
