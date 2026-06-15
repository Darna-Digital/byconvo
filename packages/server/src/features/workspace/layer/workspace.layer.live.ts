import * as Layer from "effect/Layer"
import { WorkspaceRepository } from "../repository/workspace.repository.ts"
import { makeGitWorkspaceRepository } from "../repository/workspace.repository.git.ts"
import { make, WorkspaceService } from "../service/workspace.service.ts"

export const WorkspaceLive = Layer.effect(WorkspaceService)(make).pipe(
  Layer.provide(Layer.effect(WorkspaceRepository)(makeGitWorkspaceRepository))
)
