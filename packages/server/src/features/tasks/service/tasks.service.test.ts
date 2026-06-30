import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { TasksMemory } from "../layer/tasks.layer.memory.ts"
import { TasksService } from "./tasks.service.ts"

describe("TasksService", () => {
  it.effect("create assigns a stable key and defaults to the todo column", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const card = yield* service.create({
        title: "Ship feature",
        description: "",
        column: "todo",
      })
      expect(card.key).toBe("T-1")
      expect(card.column).toBe("todo")
      const board = yield* service.board
      expect(board.cards.map((c) => c.key)).toContain("T-1")
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("setPrefix changes the keys minted for new tasks", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const board = yield* service.setPrefix("dar")
      expect(board.prefix).toBe("DAR")
      const card = yield* service.create({
        title: "Add rate limiting",
        description: "with a token bucket",
        column: "todo",
      })
      expect(card.key).toBe("DAR-1")
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("resolveTask finds a task by key, phrase, or title", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      yield* service.setPrefix("DAR")
      yield* service.create({
        title: "Add rate limiting",
        description: "",
        column: "todo",
      })
      const byKey = yield* service.resolveTask("DAR-1")
      expect(byKey.title).toBe("Add rate limiting")
      const byPhrase = yield* service.resolveTask("implement task DAR-1 please")
      expect(byPhrase.key).toBe("DAR-1")
      const byTitle = yield* service.resolveTask("rate limiting")
      expect(byTitle.key).toBe("DAR-1")
      const tasks = yield* service.listTasks
      expect(tasks).toHaveLength(1)
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("resolveTask fails with NotFound for an unknown reference", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const result = yield* Effect.flip(service.resolveTask("NOPE-9"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("update moves a card to another column", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const card = yield* service.create({
        title: "Task",
        description: "",
        column: "todo",
      })
      const moved = yield* service.update(card.id, { column: "in_progress" })
      expect(moved.column).toBe("in_progress")
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("update fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const result = yield* Effect.flip(service.update("nope", { title: "x" }))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(TasksMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const service = yield* TasksService
      const card = yield* service.create({
        title: "Temp",
        description: "",
        column: "todo",
      })
      yield* service.remove(card.id)
      const board = yield* service.board
      expect(board.cards).toHaveLength(0)
    }).pipe(Effect.provide(TasksMemory()))
  )
})
