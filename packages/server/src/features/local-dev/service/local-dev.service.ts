import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import {
  DevCommandsRepository,
  type DevCommandsRepo,
} from "../repository/local-dev.repository.ts"

export interface DevCommandsServiceShape extends DevCommandsRepo {}

export class LocalDevService extends Context.Service<
  LocalDevService,
  DevCommandsServiceShape
>()("LocalDevService") {}

export const make = Effect.gen(function* () {
  const repo = yield* DevCommandsRepository
  return LocalDevService.of(repo)
})
