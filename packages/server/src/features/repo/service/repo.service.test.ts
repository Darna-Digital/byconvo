import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { RepoMemory } from "../layer/repo.layer.memory.ts"
import type { BranchInfo, CommitInfo } from "../schema/repo.schema.model.ts"
import type { LogQuery } from "../schema/repo.schema.requests.ts"
import { RepoService } from "./repo.service.ts"

const baseQuery: LogQuery = {
  ref: "HEAD",
  limit: 50,
  author: null,
  grep: null,
  regex: false,
  caseSensitive: false,
  after: null,
  before: null,
  path: null,
}

const commit = (sha: string): CommitInfo => ({
  sha,
  shortSha: sha.slice(0, 7),
  author: "tester",
  authoredAt: "2026-01-01T00:00:00Z",
  subject: sha,
  refs: [],
  parents: [],
})

describe("RepoService", () => {
  it.effect("forwards repo info from the repository", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const info = yield* repo.info
      expect(info.currentBranch).toBe("trunk")
    }).pipe(
      Effect.provide(
        RepoMemory({
          info: {
            root: "/r",
            name: "r",
            currentBranch: "trunk",
            remoteUrl: null,
            github: null,
          },
        })
      )
    )
  )

  it.effect("log honours the query limit", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const commits = yield* repo.log({ ...baseQuery, limit: 2 })
      expect(commits.map((c) => c.sha)).toEqual(["a", "b"])
    }).pipe(
      Effect.provide(
        RepoMemory({ commits: [commit("a"), commit("b"), commit("c")] })
      )
    )
  )

  it.effect("branches come through from the repository", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const branches = yield* repo.branches
      expect(branches.map((b: BranchInfo) => b.name)).toEqual(["main"])
    }).pipe(
      Effect.provide(
        RepoMemory({
          branches: [
            {
              name: "main",
              sha: "abc",
              isCurrent: true,
              upstream: null,
              ahead: 0,
              behind: 0,
              committedAt: "",
              subject: "",
            },
          ],
        })
      )
    )
  )

  it.effect("commit returns the new sha", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const sha = yield* repo.commit("msg", [])
      expect(sha).toBe("newsha1")
    }).pipe(Effect.provide(RepoMemory()))
  )

  it.effect("mergeState defaults to no operation in progress", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const state = yield* repo.mergeState
      expect(state.operation).toBe("none")
      expect(state.conflicted).toEqual([])
    }).pipe(Effect.provide(RepoMemory()))
  )

  it.effect("mergeState surfaces the seeded operation and conflicts", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const state = yield* repo.mergeState
      expect(state.operation).toBe("rebase")
      expect(state.incoming).toBe("feature")
      expect(state.conflicted.map((c) => c.path)).toEqual(["src/app.ts"])
      expect(state.conflicted[0]?.kind).toBe("both-modified")
    }).pipe(
      Effect.provide(
        RepoMemory({
          mergeState: {
            operation: "rebase",
            incoming: "feature",
            onto: "main",
            conflicted: [{ path: "src/app.ts", kind: "both-modified" }],
          },
        })
      )
    )
  )

  it.effect("conflictBlobs returns the seeded index stages", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      const blobs = yield* repo.conflictBlobs("src/app.ts")
      expect(blobs.ours).toBe("ours")
      expect(blobs.theirs).toBe("theirs")
    }).pipe(
      Effect.provide(
        RepoMemory({
          conflictBlobs: {
            path: "src/app.ts",
            base: "base",
            ours: "ours",
            theirs: "theirs",
          },
        })
      )
    )
  )

  it.effect("abort and continue return command output", () =>
    Effect.gen(function* () {
      const repo = yield* RepoService
      expect(yield* repo.abortMerge).toBe("aborted")
      expect(yield* repo.continueMerge).toBe("continued")
      yield* repo.resolveConflict("src/app.ts", "ours")
    }).pipe(Effect.provide(RepoMemory()))
  )
})
