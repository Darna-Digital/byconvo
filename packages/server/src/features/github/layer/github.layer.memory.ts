import * as Layer from "effect/Layer"
import { GitHubRepository } from "../repository/github.repository.ts"
import {
  makeMemoryGitHubRepository,
  type MemoryGitHubSeed,
} from "../repository/github.repository.memory.ts"
import { GitHubService, make } from "../service/github.service.ts"

export const GitHubMemory = (seed: MemoryGitHubSeed = {}) =>
  Layer.effect(GitHubService)(make).pipe(
    Layer.provide(
      Layer.effect(GitHubRepository)(makeMemoryGitHubRepository(seed))
    )
  )
