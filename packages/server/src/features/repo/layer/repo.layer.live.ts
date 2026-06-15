import * as Layer from "effect/Layer"
import { RepoRepository } from "../repository/repo.repository.ts"
import { makeGitRepoRepository } from "../repository/repo.repository.git.ts"
import { make, RepoService } from "../service/repo.service.ts"

export const RepoLive = Layer.effect(RepoService)(make).pipe(
  Layer.provide(Layer.effect(RepoRepository)(makeGitRepoRepository))
)
