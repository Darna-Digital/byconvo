import * as Layer from "effect/Layer"
import { ThreadsRepository } from "../repository/threads.repository.ts"
import { makeFileThreadsRepository } from "../repository/threads.repository.file.ts"
import { ThreadsService, make } from "../service/threads.service.ts"

export const ThreadsLive = Layer.effect(ThreadsService)(make).pipe(
  Layer.provide(Layer.effect(ThreadsRepository)(makeFileThreadsRepository))
)
