import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { CommentsMemory } from "../layer/comments.layer.memory.ts"
import { CommentsService } from "./comments.service.ts"

const input = {
  filePath: "src/a.ts",
  side: "additions" as const,
  lineNumber: 12,
  body: "looks good",
  author: "alice",
  target: "worktree",
}

describe("CommentsService", () => {
  it.effect("add stamps id + source=local and lists it back", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsService
      const created = yield* comments.add(input)
      expect(created.source).toBe("local")
      expect(created.id).not.toBe("")
      const all = yield* comments.list
      expect(all.map((c) => c.body)).toContain("looks good")
    }).pipe(Effect.provide(CommentsMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const comments = yield* CommentsService
      const created = yield* comments.add(input)
      yield* comments.remove(created.id)
      const all = yield* comments.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(CommentsMemory()))
  )
})
