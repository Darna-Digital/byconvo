/**
 * GitHubClient — thin REST gateway to the GitHub API for the currently
 * selected repository. Resolves the owner/repo from `origin`, finds an auth
 * token (GITHUB_TOKEN / GH_TOKEN / `gh auth token`), and exposes JSON/text
 * helpers the GitHub feature repository builds on.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { GitHubError } from "../errors.ts"
import { GitExec } from "../git/git-exec.ts"

const API = "https://api.github.com"

export interface GitHubRepo {
  readonly owner: string
  readonly repo: string
}

export interface GitHubClientShape {
  /** owner/repo for `origin`, or fail when it is not a GitHub remote. */
  readonly repo: Effect.Effect<GitHubRepo, GitHubError>
  readonly getJson: (path: string) => Effect.Effect<unknown, GitHubError>
  readonly getText: (
    path: string,
    accept: string
  ) => Effect.Effect<string, GitHubError>
  readonly postJson: (
    path: string,
    body: unknown
  ) => Effect.Effect<unknown, GitHubError>
}

export class GitHubClient extends Context.Service<
  GitHubClient,
  GitHubClientShape
>()("GitHubClient") {}

const parseGitHubRemote = (url: string): GitHubRepo | null => {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  const owner = match?.[1]
  const repo = match?.[2]
  return owner !== undefined && repo !== undefined ? { owner, repo } : null
}

export const make = Effect.gen(function* () {
  const git = yield* GitExec
  const client = yield* HttpClient.HttpClient
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

  const tokenFromGhCli = spawner
    .string(ChildProcess.make("gh", ["auth", "token"]))
    .pipe(
      Effect.map((out) => out.trim()),
      Effect.map((out) => (out.length > 0 ? out : null)),
      // `gh` not on PATH (common in a packaged app launched from Finder) or not
      // logged in. Log it — otherwise the request silently goes out
      // unauthenticated and private-repo data comes back empty with no clue why.
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning(
            "GitHub auth: could not get a token from `gh auth token`; " +
              "continuing unauthenticated (private repos will return no data). " +
              "Set GITHUB_TOKEN/GH_TOKEN or ensure the `gh` CLI is installed and on PATH.",
            error
          ),
          null
        )
      )
    )

  const resolveToken = Effect.gen(function* () {
    const env = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"]
    if (env !== undefined && env.length > 0) return env
    return yield* tokenFromGhCli
  })

  const repo: GitHubClientShape["repo"] = git
    .run("remote", "get-url", "origin")
    .pipe(
      Effect.mapError((error) => new GitHubError({ reason: error.message })),
      Effect.flatMap((out) => {
        const parsed = parseGitHubRemote(out.trim())
        return parsed === null
          ? Effect.fail(
              new GitHubError({ reason: "origin is not a GitHub remote" })
            )
          : Effect.succeed(parsed)
      })
    )

  const headers = (accept: string) =>
    Effect.map(resolveToken, (token) => ({
      accept,
      "x-github-api-version": "2022-11-28",
      "user-agent": "bemybond.com",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    }))

  const getJson: GitHubClientShape["getJson"] = (path) =>
    Effect.gen(function* () {
      const requestHeaders = yield* headers("application/vnd.github+json")
      const response = yield* client
        .execute(
          HttpClientRequest.get(`${API}${path}`, { headers: requestHeaders })
        )
        .pipe(
          Effect.mapError((error) => new GitHubError({ reason: String(error) }))
        )
      if (response.status >= 400) {
        const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(
          new GitHubError({
            reason: `GitHub responded ${response.status}: ${body}`,
          })
        )
      }
      return yield* response.json.pipe(
        Effect.mapError((error) => new GitHubError({ reason: String(error) }))
      )
    })

  const getText: GitHubClientShape["getText"] = (path, accept) =>
    Effect.gen(function* () {
      const requestHeaders = yield* headers(accept)
      const response = yield* client
        .execute(
          HttpClientRequest.get(`${API}${path}`, { headers: requestHeaders })
        )
        .pipe(
          Effect.mapError((error) => new GitHubError({ reason: String(error) }))
        )
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
      if (response.status >= 400) {
        return yield* Effect.fail(
          new GitHubError({
            reason: `GitHub responded ${response.status}: ${body}`,
          })
        )
      }
      return body
    })

  const postJson: GitHubClientShape["postJson"] = (path, body) =>
    Effect.gen(function* () {
      const requestHeaders = yield* headers("application/vnd.github+json")
      const response = yield* client
        .execute(
          HttpClientRequest.bodyJsonUnsafe(
            HttpClientRequest.post(`${API}${path}`, {
              headers: requestHeaders,
            }),
            body
          )
        )
        .pipe(
          Effect.mapError((error) => new GitHubError({ reason: String(error) }))
        )
      if (response.status >= 400) {
        const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
        return yield* Effect.fail(
          new GitHubError({
            reason: `GitHub responded ${response.status}: ${text}`,
          })
        )
      }
      return yield* response.json.pipe(
        Effect.mapError((error) => new GitHubError({ reason: String(error) }))
      )
    })

  return GitHubClient.of({ repo, getJson, getText, postJson })
})

export const layer: Layer.Layer<
  GitHubClient,
  never,
  GitExec | HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner
> = Layer.effect(GitHubClient)(make)
