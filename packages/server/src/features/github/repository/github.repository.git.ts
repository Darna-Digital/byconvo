/**
 * GitHub-backed PR repository — the real implementation. Ports `core/GitHub.ts`
 * onto the shared `GitHubClient` (owner/repo resolution + REST helpers).
 */
import * as Effect from "effect/Effect"
import { GitHubError } from "../../../layers/errors.ts"
import { GitHubClient } from "../../../layers/github/github-client.ts"
import type { ReviewComment } from "../../comments/schema/comments.schema.model.ts"
import type { PullRequestInfo } from "../schema/github.schema.model.ts"
import type { GitHubRepo } from "./github.repository.ts"

/* eslint-disable @typescript-eslint/no-explicit-any */
export const makeGitHubRepository = Effect.gen(function* () {
  const gh = yield* GitHubClient

  const pulls: GitHubRepo["pulls"] = Effect.gen(function* () {
    const { owner, repo } = yield* gh.repo
    const data = (yield* gh.getJson(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`)) as any
    if (!Array.isArray(data)) return []
    return data.map((pr: any): PullRequestInfo => ({
      number: pr.number,
      title: pr.title ?? "",
      author: pr.user?.login ?? "",
      baseRef: pr.base?.ref ?? "",
      headRef: pr.head?.ref ?? "",
      headSha: pr.head?.sha ?? "",
      url: pr.html_url ?? "",
      updatedAt: pr.updated_at ?? "",
    }))
  })

  const pullDiff: GitHubRepo["pullDiff"] = (pullNumber) =>
    Effect.gen(function* () {
      const { owner, repo } = yield* gh.repo
      return yield* gh.getText(
        `/repos/${owner}/${repo}/pulls/${pullNumber}`,
        "application/vnd.github.v3.diff",
      )
    })

  const pullComments: GitHubRepo["pullComments"] = (pullNumber) =>
    Effect.gen(function* () {
      const { owner, repo } = yield* gh.repo
      const data = (yield* gh.getJson(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`,
      )) as any
      if (!Array.isArray(data)) return []
      return data.flatMap((comment: any): Array<ReviewComment> => {
        if (typeof comment.line !== "number" || typeof comment.path !== "string") return []
        return [
          {
            id: `gh-${comment.id}`,
            filePath: comment.path,
            side: comment.side === "LEFT" ? "deletions" : "additions",
            lineNumber: comment.line,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at ?? "",
            target: `pr-${pullNumber}`,
            source: "github",
          },
        ]
      })
    })

  const createPullComment: GitHubRepo["createPullComment"] = (input) =>
    Effect.gen(function* () {
      const { owner, repo } = yield* gh.repo
      const prData = (yield* gh.getJson(`/repos/${owner}/${repo}/pulls/${input.pullNumber}`)) as any
      const headSha = prData?.head?.sha
      if (typeof headSha !== "string") {
        return yield* Effect.fail(new GitHubError({ reason: "could not resolve PR head sha" }))
      }
      const created = (yield* gh.postJson(
        `/repos/${owner}/${repo}/pulls/${input.pullNumber}/comments`,
        {
          body: input.body,
          commit_id: headSha,
          path: input.filePath,
          line: input.lineNumber,
          side: input.side === "deletions" ? "LEFT" : "RIGHT",
        },
      )) as any
      return {
        id: `gh-${created.id}`,
        filePath: input.filePath,
        side: input.side,
        lineNumber: input.lineNumber,
        body: input.body,
        author: created.user?.login ?? "",
        createdAt: created.created_at ?? new Date().toISOString(),
        target: `pr-${input.pullNumber}`,
        source: "github",
      } satisfies ReviewComment
    })

  const replyToPullComment: GitHubRepo["replyToPullComment"] = (input) =>
    Effect.gen(function* () {
      const { owner, repo } = yield* gh.repo
      const created = (yield* gh.postJson(
        `/repos/${owner}/${repo}/pulls/${input.pullNumber}/comments/${input.commentId}/replies`,
        { body: input.body },
      )) as any
      return {
        id: `gh-${created.id}`,
        filePath: created.path ?? "",
        side: created.side === "LEFT" ? "deletions" : "additions",
        lineNumber: typeof created.line === "number" ? created.line : 0,
        body: created.body ?? input.body,
        author: created.user?.login ?? "",
        createdAt: created.created_at ?? new Date().toISOString(),
        target: `pr-${input.pullNumber}`,
        source: "github",
      } satisfies ReviewComment
    })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { pulls, pullDiff, pullComments, createPullComment, replyToPullComment } satisfies GitHubRepo
})
