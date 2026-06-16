/** Git repository contract — every git operation the UI needs. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { ClaudeError } from "../../../layers/errors.ts"
import type { GitFailure } from "../../../layers/git/git-exec.ts"
import type {
  BranchInfo,
  CommitDetail,
  CommitInfo,
  FilesPayload,
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
  readonly generateCommitMessage: (
    paths: ReadonlyArray<string>
  ) => Effect.Effect<string, GitFailure | ClaudeError>
  readonly push: Effect.Effect<string, GitFailure>
  readonly pull: Effect.Effect<string, GitFailure>
  readonly fetch: Effect.Effect<string, GitFailure>
  readonly merge: (branch: string) => Effect.Effect<string, GitFailure>
  readonly rebase: (onto: string) => Effect.Effect<string, GitFailure>
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
