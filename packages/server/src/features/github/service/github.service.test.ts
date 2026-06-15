import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import type { PullRequestInfo } from "../schema/github.schema.model.ts"
import { GitHubMemory } from "../layer/github.layer.memory.ts"
import { GitHubService } from "./github.service.ts"

const pr = (number: number, title: string): PullRequestInfo => ({
  number,
  title,
  author: "octocat",
  baseRef: "main",
  headRef: "feature",
  headSha: "deadbeef",
  url: `https://github.com/x/y/pull/${number}`,
  updatedAt: "2026-01-01T00:00:00Z",
})

describe("GitHubService", () => {
  it.effect("lists open pulls", () =>
    Effect.gen(function* () {
      const gh = yield* GitHubService
      const pulls = yield* gh.pulls
      expect(pulls.map((p) => p.number)).toEqual([1, 2])
    }).pipe(Effect.provide(GitHubMemory({ pulls: [pr(1, "a"), pr(2, "b")] })))
  )

  it.effect("creates a PR comment with source=github", () =>
    Effect.gen(function* () {
      const gh = yield* GitHubService
      const created = yield* gh.createPullComment({
        pullNumber: 3,
        filePath: "src/a.ts",
        side: "additions",
        lineNumber: 9,
        body: "nit",
      })
      expect(created.source).toBe("github")
      expect(created.target).toBe("pr-3")
    }).pipe(Effect.provide(GitHubMemory()))
  )
})
