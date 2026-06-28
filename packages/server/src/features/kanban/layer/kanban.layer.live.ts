import * as Layer from "effect/Layer"
import { KanbanRepository } from "../repository/kanban.repository.ts"
import { makeFileKanbanRepository } from "../repository/kanban.repository.file.ts"
import { KanbanService, make } from "../service/kanban.service.ts"

export const KanbanLive = Layer.effect(KanbanService)(make).pipe(
  Layer.provide(Layer.effect(KanbanRepository)(makeFileKanbanRepository))
)
