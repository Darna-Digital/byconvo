import * as Layer from "effect/Layer"
import { GitHubRepository } from "../repository/github.repository.ts"
import { makeGitHubRepository } from "../repository/github.repository.git.ts"
import { GitHubService, make } from "../service/github.service.ts"

export const GitHubLive = Layer.effect(GitHubService)(make).pipe(
  Layer.provide(Layer.effect(GitHubRepository)(makeGitHubRepository))
)
