import { describe, expect, it, vi } from "vitest"
import { createGitActionsFunctions } from "./git-actions.functions"
import { createGitActionsDependenciesMock } from "./git-actions.functions.mock"

describe("commitChanges", () => {
  it("commits and reports the sha", async () => {
    const deps = createGitActionsDependenciesMock()
    const ok = await createGitActionsFunctions(deps).commitChanges(
      "msg",
      ["a.ts"],
      false
    )
    expect(ok).toBe(true)
    expect(deps.sideEffects.commit).toHaveBeenCalledWith("msg", ["a.ts"])
    expect(deps.sideEffects.notify).toHaveBeenCalledWith(
      "ok",
      "Committed abc1234"
    )
    expect(deps.sideEffects.refresh).toHaveBeenCalled()
  })

  it("commits then pushes when asked", async () => {
    const deps = createGitActionsDependenciesMock()
    await createGitActionsFunctions(deps).commitChanges("msg", [], true)
    expect(deps.sideEffects.push).toHaveBeenCalled()
    expect(deps.sideEffects.notify).toHaveBeenCalledWith(
      "ok",
      "Committed abc1234 and pushed"
    )
  })

  it("keeps the commit success when the push fails", async () => {
    const deps = createGitActionsDependenciesMock({
      push: vi.fn(async () => {
        throw new Error("no upstream")
      }),
    })
    const ok = await createGitActionsFunctions(deps).commitChanges(
      "msg",
      [],
      true
    )
    expect(ok).toBe(true)
    expect(deps.sideEffects.notify).toHaveBeenCalledWith(
      "err",
      "Committed abc1234, but push failed:\nno upstream"
    )
    expect(deps.sideEffects.refresh).toHaveBeenCalled()
  })

  it("reports a failed commit and does not refresh", async () => {
    const deps = createGitActionsDependenciesMock({
      commit: vi.fn(async () => {
        throw new Error("nothing to commit")
      }),
    })
    const ok = await createGitActionsFunctions(deps).commitChanges(
      "msg",
      [],
      false
    )
    expect(ok).toBe(false)
    expect(deps.sideEffects.notify).toHaveBeenCalledWith(
      "err",
      "nothing to commit"
    )
    expect(deps.sideEffects.refresh).not.toHaveBeenCalled()
  })
})

describe("runOp", () => {
  it("prefers the op output, falls back to the label", async () => {
    const deps = createGitActionsDependenciesMock()
    const fns = createGitActionsFunctions(deps)
    await fns.runOp("Merged x", async () => ({ output: "Fast-forward" }))
    expect(deps.sideEffects.notify).toHaveBeenCalledWith("ok", "Fast-forward")
    await fns.runOp("Fetched", async () => ({ output: "" }))
    expect(deps.sideEffects.notify).toHaveBeenCalledWith("ok", "Fetched")
  })

  it("reports failures", async () => {
    const deps = createGitActionsDependenciesMock()
    await createGitActionsFunctions(deps).runOp("Merged x", async () => {
      throw new Error("conflict")
    })
    expect(deps.sideEffects.notify).toHaveBeenCalledWith("err", "conflict")
  })
})
