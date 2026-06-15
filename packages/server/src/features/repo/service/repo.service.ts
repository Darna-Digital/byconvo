/** Git service — the controller's entry point, thin over the repository. */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { RepoRepository, type RepoRepo } from "../repository/repo.repository.ts"

export interface RepoServiceShape extends RepoRepo {}

export class RepoService extends Context.Service<
  RepoService,
  RepoServiceShape
>()("RepoService") {}

export const make = Effect.gen(function* () {
  const repo = yield* RepoRepository
  return RepoService.of(repo)
})
