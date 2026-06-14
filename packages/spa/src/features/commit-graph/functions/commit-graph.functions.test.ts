import { describe, expect, it } from "vitest"
import { createCommitGraphFunctions } from "./commit-graph.functions"
import {
  createCommitGraphDependenciesMock,
  fakeCommit,
} from "./commit-graph.functions.mock"

const fns = () =>
  createCommitGraphFunctions(createCommitGraphDependenciesMock())

describe("buildLayout", () => {
  it("places a linear history in a single lane", () => {
    const { rows, width } = fns().buildLayout([
      fakeCommit("c", ["b"]),
      fakeCommit("b", ["a"]),
      fakeCommit("a", []),
    ])
    expect(width).toBe(1)
    expect(rows.map((r) => r.dotCol)).toEqual([0, 0, 0])
    expect(rows.every((r) => !r.isMerge)).toBe(true)
    // The root has no parent, so its lane carries nothing onward (null slot).
    expect(rows[2].after).toEqual([null])
  })

  it("opens a second lane for a merge and converges it back", () => {
    // m merges branch `f` (child of a) back onto mainline.
    const { rows, width } = fns().buildLayout([
      fakeCommit("m", ["b", "f"]),
      fakeCommit("f", ["a"]),
      fakeCommit("b", ["a"]),
      fakeCommit("a", []),
    ])
    expect(width).toBeGreaterThanOrEqual(2)
    const merge = rows.find((r) => r.sha === "m")!
    expect(merge.isMerge).toBe(true)
    // The merge writes into two columns (first parent + the opened lane).
    expect(merge.written.length).toBe(2)
    // `a` is reached by both lanes; only one dot is drawn for it.
    const root = rows.find((r) => r.sha === "a")!
    expect(root.dotCol).toBeGreaterThanOrEqual(0)
  })

  it("returns an empty layout for no commits", () => {
    expect(fns().buildLayout([])).toEqual({ rows: [], width: 1 })
  })
})

describe("geometry", () => {
  it("centerX uses the configured column width", () => {
    const f = createCommitGraphFunctions(
      createCommitGraphDependenciesMock({ colWidth: 20 })
    )
    expect(f.centerX(0)).toBe(10)
    expect(f.centerX(2)).toBe(50)
  })

  it("edgePath is a straight line when the column is unchanged", () => {
    expect(fns().edgePath(7, 0, 7, 13)).toBe("M 7 0 L 7 13")
  })

  it("edgePath is a cubic curve when the column shifts", () => {
    expect(fns().edgePath(7, 0, 21, 26)).toContain("C")
  })
})
