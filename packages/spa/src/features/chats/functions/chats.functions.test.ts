import { describe, expect, it } from "vitest"
import { createChatsFunctions } from "./chats.functions"
import { mockChatsDependencies } from "./chats.functions.mock"

describe("chats functions", () => {
  it("create passes the agent+branch, trims the title, and drops it when blank", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.create("claude", "  ", null, "main")
    await fns.create("codex", "  Fix parser  ", "T-1", "feat")
    expect(calls.create).toEqual([
      { title: undefined, agent: "claude", branch: "main", taskKey: null },
      { title: "Fix parser", agent: "codex", branch: "feat", taskKey: "T-1" },
    ])
  })

  it("rename trims the title and leaves the task link untouched", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.rename("c-1", "  Renamed  ")
    expect(calls.rename).toEqual([{ id: "c-1", input: { title: "Renamed" } }])
  })

  it("linkTask keeps the current title and edits only the task link", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.linkTask("c-1", "Build", "T-2")
    expect(calls.rename).toEqual([
      { id: "c-1", input: { title: "Build", taskKey: "T-2" } },
    ])
  })

  it("setBranch keeps the current title and moves only the branch", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.setBranch("c-1", "Build", "release")
    expect(calls.rename).toEqual([
      { id: "c-1", input: { title: "Build", branch: "release" } },
    ])
  })
})
