/** Git repository contract — every git operation the UI needs. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { GitFailure } from "../../../layers/git/git-exec.ts"
import type {
  BranchInfo,
  CommitDetail,
  CommitInfo,
  ConflictBlobs,
  FilesPayload,
  MergeState,
  RemoteBranchInfo,
  RepoInfo,
  RepoStatus,
} from "../schema/repo.schema.model.ts"
import type { LogQuery } from "../schema/repo.schema.requests.ts"

export interface RepoRepo {
  readonly info: Effect.Effect<RepoInfo, GitFailure>
  readonly files: Effect.Effect<FilesPayload, GitFailure>
  readonly status: Effect.Effect<RepoStatus, GitFailure>
  readonly branches: Effect.Effect<ReadonlyArray<BranchInfo>, GitFailure>
  readonly remoteBranches: Effect.Effect<
    ReadonlyArray<RemoteBranchInfo>,
    GitFailure
  >
  readonly log: (
    query: LogQuery
  ) => Effect.Effect<ReadonlyArray<CommitInfo>, GitFailure>
  readonly commitDetail: (
    sha: string
  ) => Effect.Effect<CommitDetail, GitFailure>
  readonly worktreeDiff: Effect.Effect<string, GitFailure>
  readonly rangeDiff: (
    base: string,
    head: string
  ) => Effect.Effect<string, GitFailure>
  readonly commitDiff: (sha: string) => Effect.Effect<string, GitFailure>
  readonly checkout: (branch: string) => Effect.Effect<void, GitFailure>
  readonly createBranch: (
    name: string,
    startPoint: string | null
  ) => Effect.Effect<void, GitFailure>
  readonly commit: (
    message: string,
    paths: ReadonlyArray<string>
  ) => Effect.Effect<string, GitFailure>
  readonly push: Effect.Effect<string, GitFailure>
  readonly pull: Effect.Effect<string, GitFailure>
  readonly fetch: Effect.Effect<string, GitFailure>
  readonly merge: (branch: string) => Effect.Effect<string, GitFailure>
  readonly rebase: (onto: string) => Effect.Effect<string, GitFailure>
  /** The in-progress merge/rebase operation and its remaining conflicts. */
  readonly mergeState: Effect.Effect<MergeState, GitFailure>
  /** The base/ours/theirs index stages of a conflicted file. */
  readonly conflictBlobs: (
    path: string
  ) => Effect.Effect<ConflictBlobs, GitFailure>
  /** Resolve a conflicted file by taking a side, or staging on-disk content. */
  readonly resolveConflict: (
    path: string,
    resolution: "ours" | "theirs" | "content"
  ) => Effect.Effect<void, GitFailure>
  /** Abort the in-progress operation, restoring the pre-operation state. */
  readonly abortMerge: Effect.Effect<string, GitFailure>
  /** Finish the in-progress operation once all conflicts are resolved. */
  readonly continueMerge: Effect.Effect<string, GitFailure>
  readonly renameBranch: (
    from: string,
    to: string
  ) => Effect.Effect<void, GitFailure>
  readonly deleteBranch: (
    name: string,
    force: boolean
  ) => Effect.Effect<void, GitFailure>
}

export class RepoRepository extends Context.Service<RepoRepository, RepoRepo>()(
  "RepoRepository"
) {}
