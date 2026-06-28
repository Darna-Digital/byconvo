import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { DocsRepository, type DocsRepo } from "../repository/docs.repository.ts"

export interface DocsServiceShape extends DocsRepo {}

export class DocsService extends Context.Service<
  DocsService,
  DocsServiceShape
>()("DocsService") {}

export const make = Effect.gen(function* () {
  const repo = yield* DocsRepository
  return DocsService.of(repo)
})
