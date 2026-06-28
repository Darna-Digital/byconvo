import { describe, expect, it } from "vitest"
import { createThreadsFunctions } from "./threads.functions"
import { mockThreadsDependencies } from "./threads.functions.mock"

describe("threads functions", () => {
  it("create passes the agent, trims the title, and drops it when blank", async () => {
    const { deps, calls } = mockThreadsDependencies()
    const fns = createThreadsFunctions(deps)
    await fns.create("terminal", "  ", null)
    await fns.create("claude", "  Build  ", "T-1")
    expect(calls.create).toEqual([
      { title: undefined, agent: "terminal", taskKey: null },
      { title: "Build", agent: "claude", taskKey: "T-1" },
    ])
  })

  it("run skips blank commands and trims the rest", async () => {
    const { deps, calls } = mockThreadsDependencies()
    const fns = createThreadsFunctions(deps)
    expect(await fns.run("t-1", "   ")).toBeNull()
    await fns.run("t-1", "  ls -la ")
    expect(calls.run).toEqual([{ id: "t-1", command: "ls -la" }])
  })

  it("linkTask keeps the current title and edits only the task link", async () => {
    const { deps, calls } = mockThreadsDependencies()
    const fns = createThreadsFunctions(deps)
    await fns.linkTask("t-1", "Build", "T-2")
    expect(calls.rename).toEqual([
      { id: "t-1", input: { title: "Build", taskKey: "T-2" } },
    ])
  })
})
