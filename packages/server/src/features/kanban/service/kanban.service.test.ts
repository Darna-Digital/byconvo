import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { KanbanMemory } from "../layer/kanban.layer.memory.ts"
import { KanbanService } from "./kanban.service.ts"

describe("KanbanService", () => {
  it.effect("create assigns a stable key and defaults to the todo column", () =>
    Effect.gen(function* () {
      const kanban = yield* KanbanService
      const card = yield* kanban.create({
        title: "Ship feature",
        description: "",
        column: "todo",
      })
      expect(card.key).toBe("T-1")
      expect(card.column).toBe("todo")
      const board = yield* kanban.board
      expect(board.cards.map((c) => c.key)).toContain("T-1")
    }).pipe(Effect.provide(KanbanMemory()))
  )

  it.effect("update moves a card to another column", () =>
    Effect.gen(function* () {
      const kanban = yield* KanbanService
      const card = yield* kanban.create({
        title: "Task",
        description: "",
        column: "todo",
      })
      const moved = yield* kanban.update(card.id, { column: "in_progress" })
      expect(moved.column).toBe("in_progress")
    }).pipe(Effect.provide(KanbanMemory()))
  )

  it.effect("update fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const kanban = yield* KanbanService
      const result = yield* Effect.flip(kanban.update("nope", { title: "x" }))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(KanbanMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const kanban = yield* KanbanService
      const card = yield* kanban.create({
        title: "Temp",
        description: "",
        column: "todo",
      })
      yield* kanban.remove(card.id)
      const board = yield* kanban.board
      expect(board.cards).toHaveLength(0)
    }).pipe(Effect.provide(KanbanMemory()))
  )
})
