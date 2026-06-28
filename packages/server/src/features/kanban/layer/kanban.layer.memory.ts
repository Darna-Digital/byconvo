import * as Layer from "effect/Layer"
import { KanbanRepository } from "../repository/kanban.repository.ts"
import { makeMemoryKanbanRepository } from "../repository/kanban.repository.memory.ts"
import { KanbanService, make } from "../service/kanban.service.ts"
import type { Card } from "../schema/kanban.schema.model.ts"

export const KanbanMemory = (seed: ReadonlyArray<Card> = []) =>
  Layer.effect(KanbanService)(make).pipe(
    Layer.provide(
      Layer.effect(KanbanRepository)(makeMemoryKanbanRepository(seed))
    )
  )
