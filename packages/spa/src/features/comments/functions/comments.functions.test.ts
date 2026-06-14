import { describe, expect, it } from "vitest"
import type { PullRequestInfo, ReviewComment } from "@/lib/api/types"
import { createCommentsFunctions } from "./comments.functions"
import { createCommentsDependenciesMock } from "./comments.functions.mock"

const pull: PullRequestInfo = {
  number: 5,
  title: "t",
  author: "a",
  baseRef: "main",
  headRef: "f",
  headSha: "s",
  url: "u",
  updatedAt: "",
}

const draft = { filePath: "src/a.ts", side: "additions" as const, lineNumber: 12 }

describe("submit", () => {
  it("local comment in commit/browse mode carries the target key", async () => {
    const deps = createCommentsDependenciesMock()
    const fns = createCommentsFunctions(deps)
    const created = await fns.submit({ mode: "commit", selectedPull: null, targetKey: "worktree" }, draft, "hi")
    expect(created.source).toBe("local")
    expect(deps.sideEffects.addLocalComment).toHaveBeenCalledWith(
      expect.objectContaining({ target: "worktree", filePath: "src/a.ts" }),
    )
  })

  it("PR comment in review mode goes to the selected pull", async () => {
    const deps = createCommentsDependenciesMock()
    const fns = createCommentsFunctions(deps)
    const created = await fns.submit({ mode: "review", selectedPull: pull, targetKey: "pr-5" }, draft, "nit")
    expect(created.source).toBe("github")
    expect(deps.sideEffects.addPullComment).toHaveBeenCalledWith(5, expect.objectContaining({ body: "nit" }))
  })
})

describe("remove", () => {
  it("deletes local comments", async () => {
    const deps = createCommentsDependenciesMock()
    const fns = createCommentsFunctions(deps)
    const ok = await fns.remove({ id: "x", source: "local" } as ReviewComment)
    expect(ok).toBe(true)
    expect(deps.sideEffects.deleteComment).toHaveBeenCalledWith("x")
  })

  it("refuses to delete GitHub comments", async () => {
    const deps = createCommentsDependenciesMock()
    const fns = createCommentsFunctions(deps)
    expect(await fns.remove({ id: "gh-1", source: "github" } as ReviewComment)).toBe(false)
    expect(deps.sideEffects.deleteComment).not.toHaveBeenCalled()
  })
})

describe("reply", () => {
  it("anchors the reply to the parent comment's line", async () => {
    const deps = createCommentsDependenciesMock()
    const fns = createCommentsFunctions(deps)
    const parent: ReviewComment = {
      id: "gh-42",
      filePath: "src/x.ts",
      side: "deletions",
      lineNumber: 7,
      body: "parent",
      author: "o",
      createdAt: "",
      target: "pr-5",
      source: "github",
    }
    const reply = await fns.reply(pull, parent, "agreed")
    expect(reply).not.toBeNull()
    expect(reply!.filePath).toBe("src/x.ts")
    expect(reply!.side).toBe("deletions")
    expect(reply!.lineNumber).toBe(7)
    expect(deps.sideEffects.replyPullComment).toHaveBeenCalledWith(5, 42, "agreed")
  })

  it("returns null for non-GitHub comments", async () => {
    const fns = createCommentsFunctions(createCommentsDependenciesMock())
    expect(await fns.reply(pull, { id: "local", source: "local" } as ReviewComment, "x")).toBeNull()
  })
})
