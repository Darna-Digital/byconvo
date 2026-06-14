/**
 * Workspace service — the business layer the controller talks to. Thin over
 * the repository (selection has no domain rules beyond validation), but kept as
 * its own service so the feature mirrors the darna-stack shape and is testable
 * against the in-memory repository.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { WorkspaceRepository, type WorkspaceRepo } from "../repository/workspace.repository.ts"

export interface WorkspaceServiceShape extends WorkspaceRepo {}

export class WorkspaceService extends Context.Service<WorkspaceService, WorkspaceServiceShape>()(
  "WorkspaceService",
) {}

export const make = Effect.gen(function* () {
  const repo = yield* WorkspaceRepository
  return WorkspaceService.of(repo)
})
