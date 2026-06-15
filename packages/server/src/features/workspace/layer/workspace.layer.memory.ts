import * as Layer from "effect/Layer"
import { WorkspaceRepository } from "../repository/workspace.repository.ts"
import {
  makeMemoryWorkspaceRepository,
  type MemoryWorkspaceSeed,
} from "../repository/workspace.repository.memory.ts"
import { make, WorkspaceService } from "../service/workspace.service.ts"

export const WorkspaceMemory = (seed: MemoryWorkspaceSeed = {}) =>
  Layer.effect(WorkspaceService)(make).pipe(
    Layer.provide(
      Layer.effect(WorkspaceRepository)(makeMemoryWorkspaceRepository(seed))
    )
  )
