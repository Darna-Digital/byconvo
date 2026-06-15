import * as Layer from "effect/Layer"
import { RepoRepository } from "../repository/repo.repository.ts"
import {
  makeMemoryRepoRepository,
  type MemoryRepoSeed,
} from "../repository/repo.repository.memory.ts"
import { make, RepoService } from "../service/repo.service.ts"

export const RepoMemory = (seed: MemoryRepoSeed = {}) =>
  Layer.effect(RepoService)(make).pipe(
    Layer.provide(Layer.effect(RepoRepository)(makeMemoryRepoRepository(seed)))
  )
