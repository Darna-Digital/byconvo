/**
 * GitHub service — syncs pull requests and review comments through the
 * GitHub REST API. GitLab support can later implement the same shape.
 */
import { Context, Data, Effect, Layer } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import type { HttpClientError } from "effect/unstable/http/HttpClientError"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import type { PullRequestInfo, ReviewComment } from "./domain.js"
import { Git } from "./Git.js"

export class GitHubError extends Data.TaggedError("GitHubError")<{
  readonly reason: string
}> {
  override get message(): string {
    return this.reason
  }
}

export type GitHubFailure = GitHubError | HttpClientError | PlatformError

export interface PrCommentInput {
  readonly pullNumber: number
  readonly filePath: string
  readonly side: "deletions" | "additions"
  readonly lineNumber: number
  readonly body: string
}

export interface PrCommentReplyInput {
  readonly pullNumber: number
  readonly commentId: number
  readonly body: string
}

export interface GitHubShape {
  readonly pulls: Effect.Effect<ReadonlyArray<PullRequestInfo>, GitHubFailure>
  readonly pullDiff: (pullNumber: number) => Effect.Effect<string, GitHubFailure>
  readonly pullComments: (
    pullNumber: number
  ) => Effect.Effect<ReadonlyArray<ReviewComment>, GitHubFailure>
  readonly createPullComment: (
    input: PrCommentInput
  ) => Effect.Effect<ReviewComment, GitHubFailure>
  readonly replyToPullComment: (
    input: PrCommentReplyInput
  ) => Effect.Effect<ReviewComment, GitHubFailure>
}

export class GitHub extends Context.Service<GitHub, GitHubShape>()("GitHub") {}

const API = "https://api.github.com"

export const make = Effect.gen(function*() {
  const git = yield* Git
  const client = yield* HttpClient.HttpClient
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

  const tokenFromGhCli = spawner.string(ChildProcess.make("gh", ["auth", "token"])).pipe(
    Effect.map((out) => out.trim()),
    Effect.map((out) => (out.length > 0 ? out : null)),
    Effect.catch(() => Effect.succeed(null))
  )

  const resolveToken = Effect.gen(function*() {
    const env = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"]
    if (env !== undefined && env.length > 0) return env
    return yield* tokenFromGhCli
  })

  const repo = git.info.pipe(
    Effect.mapError((error) => new GitHubError({ reason: error.message })),
    Effect.flatMap((info) =>
      info.github === null
        ? Effect.fail(new GitHubError({ reason: "origin is not a GitHub remote" }))
        : Effect.succeed(info.github)
    )
  )

  const headers = (accept: string) =>
    Effect.map(resolveToken, (token) => ({
      accept,
      "x-github-api-version": "2022-11-28",
      "user-agent": "reviewer.sh",
      ...(token === null ? {} : { authorization: `Bearer ${token}` })
    }))

  const getJson = (path: string) =>
    Effect.gen(function*() {
      const requestHeaders = yield* headers("application/vnd.github+json")
      const response = yield* client.execute(
        HttpClientRequest.get(`${API}${path}`, { headers: requestHeaders })
      )
      if (response.status >= 400) {
        const body = yield* response.text
        return yield* Effect.fail(
          new GitHubError({ reason: `GitHub responded ${response.status}: ${body}` })
        )
      }
      return yield* response.json
    })

  const getText = (path: string, accept: string) =>
    Effect.gen(function*() {
      const requestHeaders = yield* headers(accept)
      const response = yield* client.execute(
        HttpClientRequest.get(`${API}${path}`, { headers: requestHeaders })
      )
      const body = yield* response.text
      if (response.status >= 400) {
        return yield* Effect.fail(
          new GitHubError({ reason: `GitHub responded ${response.status}: ${body}` })
        )
      }
      return body
    })

  const postJson = (path: string, body: unknown) =>
    Effect.gen(function*() {
      const requestHeaders = yield* headers("application/vnd.github+json")
      const response = yield* client.execute(
        HttpClientRequest.bodyJsonUnsafe(
          HttpClientRequest.post(`${API}${path}`, { headers: requestHeaders }),
          body
        )
      )
      if (response.status >= 400) {
        const text = yield* response.text
        return yield* Effect.fail(
          new GitHubError({ reason: `GitHub responded ${response.status}: ${text}` })
        )
      }
      return yield* response.json
    })

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pulls: GitHubShape["pulls"] = Effect.gen(function*() {
    const { owner, repo: name } = yield* repo
    const data = (yield* getJson(`/repos/${owner}/${name}/pulls?state=open&per_page=50`)) as any
    if (!Array.isArray(data)) return []
    return data.map((pr: any): PullRequestInfo => ({
      number: pr.number,
      title: pr.title ?? "",
      author: pr.user?.login ?? "",
      baseRef: pr.base?.ref ?? "",
      headRef: pr.head?.ref ?? "",
      headSha: pr.head?.sha ?? "",
      url: pr.html_url ?? "",
      updatedAt: pr.updated_at ?? ""
    }))
  })

  const pullDiff: GitHubShape["pullDiff"] = (pullNumber) =>
    Effect.gen(function*() {
      const { owner, repo: name } = yield* repo
      return yield* getText(
        `/repos/${owner}/${name}/pulls/${pullNumber}`,
        "application/vnd.github.v3.diff"
      )
    })

  const pullComments: GitHubShape["pullComments"] = (pullNumber) =>
    Effect.gen(function*() {
      const { owner, repo: name } = yield* repo
      const data = (yield* getJson(
        `/repos/${owner}/${name}/pulls/${pullNumber}/comments?per_page=100`
      )) as any
      if (!Array.isArray(data)) return []
      return data.flatMap((comment: any): Array<ReviewComment> => {
        if (typeof comment.line !== "number" || typeof comment.path !== "string") return []
        return [{
          id: `gh-${comment.id}`,
          filePath: comment.path,
          side: comment.side === "LEFT" ? "deletions" : "additions",
          lineNumber: comment.line,
          body: comment.body ?? "",
          author: comment.user?.login ?? "",
          createdAt: comment.created_at ?? "",
          target: `pr-${pullNumber}`,
          source: "github"
        }]
      })
    })

  const createPullComment: GitHubShape["createPullComment"] = (input) =>
    Effect.gen(function*() {
      const { owner, repo: name } = yield* repo
      const prData = (yield* getJson(`/repos/${owner}/${name}/pulls/${input.pullNumber}`)) as any
      const headSha = prData?.head?.sha
      if (typeof headSha !== "string") {
        return yield* Effect.fail(new GitHubError({ reason: "could not resolve PR head sha" }))
      }
      const created = (yield* postJson(
        `/repos/${owner}/${name}/pulls/${input.pullNumber}/comments`,
        {
          body: input.body,
          commit_id: headSha,
          path: input.filePath,
          line: input.lineNumber,
          side: input.side === "deletions" ? "LEFT" : "RIGHT"
        }
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
        source: "github"
      } satisfies ReviewComment
    })

  const replyToPullComment: GitHubShape["replyToPullComment"] = (input) =>
    Effect.gen(function*() {
      const { owner, repo: name } = yield* repo
      const created = (yield* postJson(
        `/repos/${owner}/${name}/pulls/${input.pullNumber}/comments/${input.commentId}/replies`,
        { body: input.body }
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
        source: "github"
      } satisfies ReviewComment
    })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return GitHub.of({ pulls, pullDiff, pullComments, createPullComment, replyToPullComment })
})

export const layer: Layer.Layer<
  GitHub,
  never,
  Git | HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner
> = Layer.effect(GitHub)(make)
