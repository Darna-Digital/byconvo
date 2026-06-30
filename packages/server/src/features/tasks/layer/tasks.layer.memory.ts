import * as Layer from "effect/Layer"
import { TasksRepository } from "../repository/tasks.repository.ts"
import { makeMemoryTasksRepository } from "../repository/tasks.repository.memory.ts"
import { TasksService, make } from "../service/tasks.service.ts"
import type { Card } from "../schema/tasks.schema.model.ts"

export const TasksMemory = (seed: ReadonlyArray<Card> = []) =>
  Layer.effect(TasksService)(make).pipe(
    Layer.provide(
      Layer.effect(TasksRepository)(makeMemoryTasksRepository(seed))
    )
  )
