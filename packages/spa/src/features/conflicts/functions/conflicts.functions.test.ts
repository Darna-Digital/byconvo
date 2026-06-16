import { describe, expect, it } from "vitest"
import type { ConflictRegion } from "../entity/conflicts.interfaces"
import { createConflictsFunctions } from "./conflicts.functions"
import {
  createConflictsDependenciesMock,
  sampleConflict,
  sampleDiff3Conflict,
} from "./conflicts.functions.mock"

const fns = () => createConflictsFunctions(createConflictsDependenciesMock())

describe("parse", () => {
  it("splits context and conflict regions with labels", () => {
    const regions = fns().parse(sampleConflict)
    expect(regions.map((r) => r.kind)).toEqual([
      "context",
      "conflict",
      "context",
    ])
    const conflict = regions[1] as ConflictRegion
    expect(conflict.id).toBe(0)
    expect(conflict.ours).toEqual(["const value = 1"])
    expect(conflict.theirs).toEqual(["const value = 2"])
    expect(conflict.oursLabel).toBe("HEAD")
    expect(conflict.theirsLabel).toBe("feature")
    expect(conflict.base).toBeNull()
  })

  it("captures the diff3 base section", () => {
    const conflict = fns()
      .parse(sampleDiff3Conflict)
      .find((r): r is ConflictRegion => r.kind === "conflict")!
    expect(conflict.base).toEqual(["original"])
    expect(conflict.ours).toEqual(["ours"])
    expect(conflict.theirs).toEqual(["theirs"])
  })

  it("returns a single context region for clean content", () => {
    const regions = fns().parse("a\nb\nc")
    expect(regions).toHaveLength(1)
    expect(fns().conflicts(regions)).toHaveLength(0)
  })
})

describe("reconstruct", () => {
  it("rebuilds each side as a full file", () => {
    const f = fns()
    const regions = f.parse(sampleConflict)
    expect(f.reconstruct(regions, "ours")).toBe(
      [
        "import { a } from './a'",
        "const value = 1",
        "export default value",
      ].join("\n")
    )
    expect(f.reconstruct(regions, "theirs")).toBe(
      [
        "import { a } from './a'",
        "const value = 2",
        "export default value",
      ].join("\n")
    )
  })
})

describe("applyResolutions", () => {
  const f = fns()
  const regions = f.parse(sampleConflict)

  it("takes the chosen side", () => {
    expect(f.applyResolutions(regions, { 0: "theirs" })).toContain(
      "const value = 2"
    )
    expect(f.applyResolutions(regions, { 0: "theirs" })).not.toContain(
      "const value = 1"
    )
  })

  it("keeps both sides in the requested order", () => {
    expect(f.applyResolutions(regions, { 0: "both-ours-first" })).toBe(
      [
        "import { a } from './a'",
        "const value = 1",
        "const value = 2",
        "export default value",
      ].join("\n")
    )
    expect(f.applyResolutions(regions, { 0: "both-theirs-first" })).toContain(
      ["const value = 2", "const value = 1"].join("\n")
    )
  })

  it("preserves markers for unresolved regions", () => {
    expect(f.applyResolutions(regions, {})).toContain("<<<<<<< HEAD")
  })
})

describe("isFullyResolved", () => {
  it("is true only once every conflict has a choice", () => {
    const f = fns()
    const regions = f.parse(sampleConflict)
    expect(f.isFullyResolved(regions, {})).toBe(false)
    expect(f.isFullyResolved(regions, { 0: "ours" })).toBe(true)
  })

  it("is true for content with no conflicts", () => {
    const f = fns()
    expect(f.isFullyResolved(f.parse("plain\ntext"), {})).toBe(true)
  })
})
