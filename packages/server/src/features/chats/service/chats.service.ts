import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import {
  ChatsRepository,
  type ChatsRepo,
} from "../repository/chats.repository.ts"

export interface ChatsServiceShape extends ChatsRepo {}

export class ChatsService extends Context.Service<
  ChatsService,
  ChatsServiceShape
>()("ChatsService") {}

export const make = Effect.gen(function* () {
  const repo = yield* ChatsRepository
  return ChatsService.of(repo)
})
