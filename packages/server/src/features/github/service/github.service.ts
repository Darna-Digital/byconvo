import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { GitHubRepository, type GitHubRepo } from "../repository/github.repository.ts"

export interface GitHubServiceShape extends GitHubRepo {}

export class GitHubService extends Context.Service<GitHubService, GitHubServiceShape>()(
  "GitHubService",
) {}

export const make = Effect.gen(function* () {
  const repo = yield* GitHubRepository
  return GitHubService.of(repo)
})
