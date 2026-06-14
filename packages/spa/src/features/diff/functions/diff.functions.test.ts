import { describe, expect, it } from "vitest"
import type { GitStatusEntry, PullRequestInfo, ReviewComment } from "@/lib/api/types"
import { createDiffFunctions } from "./diff.functions"
import { createDiffDependenciesMock } from "./diff.functions.mock"

const fns = () => createDiffFunctions(createDiffDependenciesMock())

const pull = (number: number): PullRequestInfo => ({
  number,
  title: "t",
  author: "a",
  baseRef: "main",
  headRef: "f",
  headSha: "s",
  url: "u",
  updatedAt: "",
})

describe("deriveTarget", () => {
  it("commit mode → worktree", () => {
    expect(fns().deriveTarget({ mode: "commit", selectedPull: null, browse: null })).toEqual({
      kind: "worktree",
    })
  })

  it("review mode needs a selected pull", () => {
    expect(fns().deriveTarget({ mode: "review", selectedPull: null, browse: null })).toBeNull()
    expect(
      fns().deriveTarget({ mode: "review", selectedPull: pull(7), browse: null }),
    ).toEqual({ kind: "pull", pull: pull(7) })
  })

  it("browse commit / range map through", () => {
    expect(
      fns().deriveTarget({
        mode: "browse",
        selectedPull: null,
        browse: { kind: "commit", sha: "abc", shortSha: "abc1234" },
      }),
    ).toEqual({ kind: "commit", sha: "abc", shortSha: "abc1234" })
    expect(
      fns().deriveTarget({
        mode: "browse",
        selectedPull: null,
        browse: { kind: "range", base: "main", head: "feat" },
      }),
    ).toEqual({ kind: "range", base: "main", head: "feat" })
  })
})

describe("parseFiles", () => {
  it("returns [] for empty/whitespace and never throws", () => {
    expect(fns().parseFiles(null)).toEqual([])
    expect(fns().parseFiles("   ")).toEqual([])
  })
  it("delegates to the injected parser", () => {
    const files = fns().parseFiles("+++ b/src/a.ts\n+++ b/src/b.ts")
    expect(files.map((f) => f.name)).toEqual(["src/a.ts", "src/b.ts"])
  })
})

describe("tree derivations", () => {
  const status: GitStatusEntry[] = [
    { path: "src/a.ts", status: "modified" },
    { path: ".reviewer/comments.json", status: "modified" },
  ]

  it("commit mode lists only changed, non-internal paths", () => {
    const paths = fns().treePaths({
      mode: "commit",
      allPaths: ["src/a.ts", "src/b.ts", ".reviewer/comments.json"],
      gitStatus: status,
      parsedFiles: [],
    })
    expect(paths).toEqual(["src/a.ts"])
  })

  it("commit mode also lists commented-but-unchanged paths", () => {
    const paths = fns().treePaths({
      mode: "commit",
      allPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
      gitStatus: [{ path: "src/a.ts", status: "modified" }],
      parsedFiles: [],
      commentedPaths: ["src/c.ts"],
    })
    expect(paths).toEqual(["src/a.ts", "src/c.ts"])
  })

  it("browse mode lists every non-internal path", () => {
    const paths = fns().treePaths({
      mode: "browse",
      allPaths: ["src/a.ts", ".reviewer/x"],
      gitStatus: [],
      parsedFiles: [],
    })
    expect(paths).toEqual(["src/a.ts"])
  })

  it("changedFiles strips the internal dir", () => {
    expect(fns().changedFiles(status).map((e) => e.path)).toEqual(["src/a.ts"])
  })
})

describe("visibleComments", () => {
  const local: ReviewComment[] = [
    { id: "1", filePath: "a", side: "additions", lineNumber: 1, body: "", author: "", createdAt: "", target: "worktree", source: "local" },
    { id: "2", filePath: "a", side: "additions", lineNumber: 2, body: "", author: "", createdAt: "", target: "commit-x", source: "local" },
  ]

  it("filters local comments by target key", () => {
    const out = fns().visibleComments({ targetKind: "worktree", targetKey: "worktree", localComments: local, pullComments: [] })
    expect(out.map((c) => c.id)).toEqual(["1"])
  })

  it("uses pull comments for a pull target", () => {
    const pr: ReviewComment[] = [{ ...local[0], id: "pr1", source: "github", target: "pr-3" }]
    const out = fns().visibleComments({ targetKind: "pull", targetKey: "pr-3", localComments: local, pullComments: pr })
    expect(out.map((c) => c.id)).toEqual(["pr1"])
  })
})
