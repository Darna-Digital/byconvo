import type { BranchInfo, RemoteBranchInfo } from "@/lib/api/types"
import type { BranchTreeDependencies } from "../entity/branch-tree.interfaces"

export const createBranchTreeDependenciesMock = (): BranchTreeDependencies => ({
  data: {},
  sideEffects: {},
})

export const fakeBranch = (
  name: string,
  extra: Partial<BranchInfo> = {},
): BranchInfo =>
  ({
    name,
    sha: "0".repeat(40),
    isCurrent: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    committedAt: "",
    subject: name,
    ...extra,
  })

export const fakeRemoteBranch = (
  name: string,
  extra: Partial<RemoteBranchInfo> = {},
): RemoteBranchInfo =>
  ({
    name,
    remote: name.split("/")[0] ?? "origin",
    shortName: name.split("/").slice(1).join("/") || name,
    sha: "0".repeat(40),
    committedAt: "",
    subject: name,
    ...extra,
  })
