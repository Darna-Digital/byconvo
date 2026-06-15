/** Workspace repository contract — selection, directory browsing, file IO. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  InvalidRepo,
  NoRepoSelected,
  StorageError,
} from "../../../layers/errors.ts"
import type {
  BrowsePayload,
  FileContent,
  WorkspaceInfo,
} from "../schema/workspace.schema.model.ts"

export interface WorkspaceRepo {
  readonly info: Effect.Effect<WorkspaceInfo, StorageError>
  readonly setCurrent: (
    path: string
  ) => Effect.Effect<WorkspaceInfo, InvalidRepo | StorageError>
  readonly browse: (
    path: string | null
  ) => Effect.Effect<BrowsePayload, StorageError>
  readonly readFile: (
    relPath: string
  ) => Effect.Effect<FileContent, NoRepoSelected | StorageError>
  readonly writeFile: (
    relPath: string,
    contents: string
  ) => Effect.Effect<void, NoRepoSelected | StorageError>
  readonly deletePath: (
    relPath: string
  ) => Effect.Effect<void, NoRepoSelected | StorageError>
  readonly renamePath: (
    fromRel: string,
    toRel: string
  ) => Effect.Effect<void, NoRepoSelected | StorageError>
}

export class WorkspaceRepository extends Context.Service<
  WorkspaceRepository,
  WorkspaceRepo
>()("WorkspaceRepository") {}
