import { describe, expect, it } from "vitest"
import { createDocsFunctions } from "./docs.functions"
import { mockDocsDependencies } from "./docs.functions.mock"

describe("docs functions", () => {
  it("create skips blank titles and trims the rest", async () => {
    const { deps, calls } = mockDocsDependencies()
    const fns = createDocsFunctions(deps)
    expect(await fns.create("   ")).toBeNull()
    await fns.create("  Migration  ")
    expect(calls.create).toEqual(["Migration"])
  })

  it("save passes content through verbatim", async () => {
    const { deps, calls } = mockDocsDependencies()
    const fns = createDocsFunctions(deps)
    await fns.save("plan", "# Plan\n\nstep one")
    expect(calls.save).toEqual([{ id: "plan", content: "# Plan\n\nstep one" }])
  })
})
