import * as Layer from "effect/Layer"
import { DevCommandsRepository } from "../repository/local-dev.repository.ts"
import { makeFileDevCommandsRepository } from "../repository/local-dev.repository.file.ts"
import { LocalDevService, make } from "../service/local-dev.service.ts"

export const LocalDevLive = Layer.effect(LocalDevService)(make).pipe(
  Layer.provide(
    Layer.effect(DevCommandsRepository)(makeFileDevCommandsRepository)
  )
)
