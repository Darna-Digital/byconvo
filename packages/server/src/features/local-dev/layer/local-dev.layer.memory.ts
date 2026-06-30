import * as Layer from "effect/Layer"
import { DevCommandsRepository } from "../repository/local-dev.repository.ts"
import { makeMemoryDevCommandsRepository } from "../repository/local-dev.repository.memory.ts"
import { LocalDevService, make } from "../service/local-dev.service.ts"
import type { DevCommand } from "../schema/local-dev.schema.model.ts"

export const LocalDevMemory = (seed: ReadonlyArray<DevCommand> = []) =>
  Layer.effect(LocalDevService)(make).pipe(
    Layer.provide(
      Layer.effect(DevCommandsRepository)(makeMemoryDevCommandsRepository(seed))
    )
  )
