import { describe, expect, it } from "vitest"
import { createChatsFunctions } from "./chats.functions"
import { mockChatsDependencies } from "./chats.functions.mock"

const settings = {
  provider: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  access: "fullAccess",
  mode: "build",
} as const

describe("createChatsFunctions", () => {
  it("start creates the chat then sends the trimmed first prompt", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    const result = await fns.start(settings, "main", "  hey  ")
    expect(result).not.toBeNull()
    expect(calls.create).toEqual([{ ...settings, branch: "main" }])
    expect(calls.send).toEqual([{ id: "c-1", text: "hey" }])
  })

  it("start with a blank prompt creates nothing", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    const result = await fns.start(settings, "main", "   ")
    expect(result).toBeNull()
    expect(calls.create).toHaveLength(0)
    expect(calls.send).toHaveLength(0)
  })

  it("send trims and skips blank prompts", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.send("c-9", "  fix the bug  ")
    expect(await fns.send("c-9", " \n ")).toBeNull()
    expect(calls.send).toEqual([{ id: "c-9", text: "fix the bug" }])
  })

  it("rename trims the title and drops a blank rename", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.rename("c-1", "  Ship it  ")
    await fns.rename("c-1", "   ")
    expect(calls.update).toEqual([
      { id: "c-1", input: { title: "Ship it" } },
      { id: "c-1", input: {} },
    ])
  })

  it("updateSettings passes the patch through", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.updateSettings("c-1", { mode: "plan", effort: "low" })
    expect(calls.update).toEqual([
      { id: "c-1", input: { mode: "plan", effort: "low" } },
    ])
  })

  it("stop and remove delegate by id", async () => {
    const { deps, calls } = mockChatsDependencies()
    const fns = createChatsFunctions(deps)
    await fns.stop("c-1")
    await fns.remove("c-2")
    expect(calls.stop).toEqual(["c-1"])
    expect(calls.remove).toEqual(["c-2"])
  })
})
