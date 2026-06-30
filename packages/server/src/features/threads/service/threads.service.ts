import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import {
  ThreadsRepository,
  type ThreadsRepo,
} from "../repository/threads.repository.ts"

export interface ThreadsServiceShape extends ThreadsRepo {}

export class ThreadsService extends Context.Service<
  ThreadsService,
  ThreadsServiceShape
>()("ThreadsService") {}

export const make = Effect.gen(function* () {
  const repo = yield* ThreadsRepository
  return ThreadsService.of(repo)
})
