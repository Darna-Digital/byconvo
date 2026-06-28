/** Local dev-command store contract (definitions only — runtime lives in the
 * DevProcessManager / DevRuntime). */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import type { DevCommand } from "../schema/local-dev.schema.model.ts"

export interface CreateDevCommandInput {
  readonly name: string
  readonly command: string
}

export interface UpdateDevCommandInput {
  /** `undefined` leaves the field unchanged. */
  readonly name?: string
  readonly command?: string
}

export type DevCommandsFailure = NoRepoSelected | NotFound | StorageError

export interface DevCommandsRepo {
  readonly list: Effect.Effect<ReadonlyArray<DevCommand>, DevCommandsFailure>
  readonly get: (id: string) => Effect.Effect<DevCommand, DevCommandsFailure>
  readonly create: (
    input: CreateDevCommandInput
  ) => Effect.Effect<DevCommand, DevCommandsFailure>
  readonly update: (
    id: string,
    input: UpdateDevCommandInput
  ) => Effect.Effect<DevCommand, DevCommandsFailure>
  readonly remove: (id: string) => Effect.Effect<void, DevCommandsFailure>
}

export class DevCommandsRepository extends Context.Service<
  DevCommandsRepository,
  DevCommandsRepo
>()("DevCommandsRepository") {}
