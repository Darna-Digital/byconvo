import * as Layer from "effect/Layer"
import { TasksRepository } from "../repository/tasks.repository.ts"
import { makeFileTasksRepository } from "../repository/tasks.repository.file.ts"
import { TasksService, make } from "../service/tasks.service.ts"

export const TasksLive = Layer.effect(TasksService)(make).pipe(
  Layer.provide(Layer.effect(TasksRepository)(makeFileTasksRepository))
)
