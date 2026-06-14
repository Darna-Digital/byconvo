/** In-memory GitHub repository for tests — no network. */
import * as Effect from "effect/Effect"
import type { ReviewComment } from "../../comments/schema/comments.schema.model.ts"
import type { PullRequestInfo } from "../schema/github.schema.model.ts"
import type { GitHubRepo } from "./github.repository.ts"

export interface MemoryGitHubSeed {
  readonly pulls?: ReadonlyArray<PullRequestInfo>
  readonly comments?: ReadonlyArray<ReviewComment>
  readonly diff?: string
}

export const makeMemoryGitHubRepository = (seed: MemoryGitHubSeed = {}) =>
  Effect.gen(function* () {
    const repo: GitHubRepo = {
      pulls: Effect.succeed(seed.pulls ?? []),
      pullDiff: () => Effect.succeed(seed.diff ?? ""),
      pullComments: () => Effect.succeed(seed.comments ?? []),
      createPullComment: (input) =>
        Effect.succeed({
          id: "gh-new",
          filePath: input.filePath,
          side: input.side,
          lineNumber: input.lineNumber,
          body: input.body,
          author: "tester",
          createdAt: "2026-01-01T00:00:00.000Z",
          target: `pr-${input.pullNumber}`,
          source: "github",
        }),
      replyToPullComment: (input) =>
        Effect.succeed({
          id: "gh-reply",
          filePath: "",
          side: "additions",
          lineNumber: 0,
          body: input.body,
          author: "tester",
          createdAt: "2026-01-01T00:00:00.000Z",
          target: `pr-${input.pullNumber}`,
          source: "github",
        }),
    }
    return repo
  })
