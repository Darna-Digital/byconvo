/** In-memory git repository for tests — canned fixtures, no real git. */
import * as Effect from "effect/Effect"
import type {
  BranchInfo,
  CommitInfo,
  ConflictBlobs,
  FilesPayload,
  MergeState,
  RepoInfo,
  RepoStatus,
} from "../schema/repo.schema.model.ts"
import type { RepoRepo } from "./repo.repository.ts"

export interface MemoryRepoSeed {
  readonly info?: RepoInfo
  readonly files?: FilesPayload
  readonly status?: RepoStatus
  readonly branches?: ReadonlyArray<BranchInfo>
  readonly commits?: ReadonlyArray<CommitInfo>
  readonly diff?: string
  readonly mergeState?: MergeState
  readonly conflictBlobs?: ConflictBlobs
}

const defaultInfo: RepoInfo = {
  root: "/repo",
  name: "repo",
  currentBranch: "main",
  remoteUrl: null,
  github: null,
}

const defaultStatus: RepoStatus = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  headSha: "abc1234",
  changed: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  conflicted: 0,
}

export const makeMemoryRepoRepository = (seed: MemoryRepoSeed = {}) =>
  Effect.gen(function* () {
    const repo: RepoRepo = {
      info: Effect.succeed(seed.info ?? defaultInfo),
      files: Effect.succeed(seed.files ?? { paths: [], gitStatus: [] }),
      status: Effect.succeed(seed.status ?? defaultStatus),
      branches: Effect.succeed(seed.branches ?? []),
      remoteBranches: Effect.succeed([]),
      log: (query) =>
        Effect.succeed((seed.commits ?? []).slice(0, query.limit)),
      commitDetail: (sha) =>
        Effect.succeed({
          sha,
          shortSha: sha.slice(0, 7),
          author: "tester",
          authorEmail: "t@example.com",
          authoredAt: "2026-01-01T00:00:00Z",
          subject: "seed commit",
          body: "",
          refs: [],
          parents: [],
          files: [],
          containingBranches: [],
        }),
      worktreeDiff: Effect.succeed(seed.diff ?? ""),
      rangeDiff: () => Effect.succeed(seed.diff ?? ""),
      commitDiff: () => Effect.succeed(seed.diff ?? ""),
      checkout: () => Effect.void,
      createBranch: () => Effect.void,
      commit: () => Effect.succeed("newsha1"),
      push: Effect.succeed("pushed"),
      pull: Effect.succeed("pulled"),
      fetch: Effect.succeed("fetched"),
      merge: () => Effect.succeed("merged"),
      rebase: () => Effect.succeed("rebased"),
      mergeState: Effect.succeed(
        seed.mergeState ?? {
          operation: "none",
          incoming: null,
          onto: null,
          conflicted: [],
        }
      ),
      conflictBlobs: (path) =>
        Effect.succeed(
          seed.conflictBlobs ?? { path, base: null, ours: "", theirs: "" }
        ),
      resolveConflict: () => Effect.void,
      abortMerge: Effect.succeed("aborted"),
      continueMerge: Effect.succeed("continued"),
      renameBranch: () => Effect.void,
      deleteBranch: () => Effect.void,
    }
    return repo
  })
