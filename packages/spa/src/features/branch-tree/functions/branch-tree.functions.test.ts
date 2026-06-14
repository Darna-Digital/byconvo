import { describe, expect, it } from "vitest"
import type { BranchFolder, BranchLeaf } from "../entity/branch-tree.interfaces"
import { createBranchTreeFunctions } from "./branch-tree.functions"
import {
  createBranchTreeDependenciesMock,
  fakeBranch,
  fakeRemoteBranch,
} from "./branch-tree.functions.mock"

const fns = () => createBranchTreeFunctions(createBranchTreeDependenciesMock())

describe("buildTrees", () => {
  it("groups slashed branches under folders and leaves plain ones at the root", () => {
    const { local } = fns().buildTrees({
      branches: [fakeBranch("master"), fakeBranch("task/BMB-1"), fakeBranch("task/BMB-2")],
      remoteBranches: [],
      favorites: new Set(),
      query: "",
    })
    // Folder "task" sorts before the leaf "master".
    expect(local.map((i) => (i.kind === "folder" ? `folder:${i.label}` : i.label))).toEqual([
      "folder:task",
      "master",
    ])
    const task = local[0] as BranchFolder
    expect(task.children.map((c) => (c as BranchLeaf).label)).toEqual(["BMB-1", "BMB-2"])
  })

  it("floats favourited branches above the rest at the same level", () => {
    const { local } = fns().buildTrees({
      branches: [fakeBranch("alpha"), fakeBranch("zeta")],
      remoteBranches: [],
      favorites: new Set(["zeta"]),
      query: "",
    })
    expect((local as BranchLeaf[]).map((i) => i.label)).toEqual(["zeta", "alpha"])
  })

  it("filters leaves by a case-insensitive query", () => {
    const { local } = fns().buildTrees({
      branches: [fakeBranch("feature/login"), fakeBranch("hotfix/crash")],
      remoteBranches: [],
      favorites: new Set(),
      query: "LOGIN",
    })
    expect(fns().folderPaths(local)).toEqual(["feature"])
  })

  it("nests remote branches under their remote name", () => {
    const { remote } = fns().buildTrees({
      branches: [],
      remoteBranches: [fakeRemoteBranch("origin/feature")],
      favorites: new Set(),
      query: "",
    })
    const origin = remote[0] as BranchFolder
    expect(origin.kind).toBe("folder")
    expect(origin.label).toBe("origin")
    expect((origin.children[0] as BranchLeaf).label).toBe("feature")
  })
})

describe("flatten", () => {
  it("only emits children of expanded folders", () => {
    const { local } = fns().buildTrees({
      branches: [fakeBranch("task/a"), fakeBranch("task/b")],
      remoteBranches: [],
      favorites: new Set(),
      query: "",
    })
    const collapsed = fns().flatten(local, () => false)
    expect(collapsed.map((r) => r.key)).toEqual(["f:task"])

    const expanded = fns().flatten(local, () => true)
    expect(expanded.map((r) => r.key)).toEqual(["f:task", "b:task/a", "b:task/b"])
    expect(expanded[1].depth).toBe(2)
  })
})

describe("toggleFavorite", () => {
  it("adds then removes a name immutably", () => {
    const base = new Set<string>()
    const added = fns().toggleFavorite(base, "x")
    expect([...added]).toEqual(["x"])
    expect([...base]).toEqual([])
    expect([...fns().toggleFavorite(added, "x")]).toEqual([])
  })
})
