import { describe, expect, it } from "vitest"
import { createTasksFunctions } from "./tasks.functions"
import { card, mockTasksDependencies } from "./tasks.functions.mock"

describe("tasks functions", () => {
  it("columns groups cards into the fixed columns sorted by order", () => {
    const { deps } = mockTasksDependencies([
      card({ id: "a", column: "todo", order: 2 }),
      card({ id: "b", column: "todo", order: 1 }),
      card({ id: "c", column: "done", order: 1 }),
    ])
    const groups = createTasksFunctions(deps).columns()
    expect(groups.map((g) => g.key)).toEqual(["todo", "in_progress", "done"])
    expect(groups[0].cards.map((c) => c.id)).toEqual(["b", "a"])
    expect(groups[1].cards).toHaveLength(0)
    expect(groups[2].cards.map((c) => c.id)).toEqual(["c"])
  })

  it("create skips blank titles", async () => {
    const { deps, calls } = mockTasksDependencies()
    const fns = createTasksFunctions(deps)
    expect(await fns.create("  ", "todo")).toBeNull()
    await fns.create(" Ship ", "todo")
    expect(calls.create).toEqual([{ title: "Ship", column: "todo" }])
  })

  it("move appends to the end of the target column and no-ops when unchanged", async () => {
    const { deps, calls } = mockTasksDependencies([
      card({ id: "a", column: "in_progress", order: 5 }),
    ])
    const fns = createTasksFunctions(deps)
    const moving = card({ id: "b", column: "todo", order: 1 })
    await fns.move(moving, "in_progress")
    expect(calls.update).toEqual([
      { id: "b", input: { column: "in_progress", order: 6 } },
    ])
    expect(await fns.move(card({ column: "todo" }), "todo")).toBeNull()
  })
})
