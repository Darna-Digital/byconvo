import type { CommitFileChange, GitFileStatus } from "@/lib/api/types"
import type { CommitDetailsDependencies } from "../entity/commit-details.interfaces"

export const createCommitDetailsDependenciesMock =
  (): CommitDetailsDependencies => ({
    data: {},
    sideEffects: {},
  })

export const fakeFileChange = (
  path: string,
  status: GitFileStatus = "modified",
  oldPath: string | null = null
): CommitFileChange => ({ path, status, oldPath })
