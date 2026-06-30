import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import {
  DevCommand,
  DevCommandView,
  Ok,
} from "../schema/local-dev.schema.model.ts"
import {
  DevCommandIdParam,
  NewDevCommand,
  UpdateDevCommand,
} from "../schema/local-dev.schema.requests.ts"

const errors = [NoRepoSelected, NotFound, StorageError] as const

export class LocalDevApi extends HttpApiGroup.make("localDev")
  .add(
    HttpApiEndpoint.get("list", "/local-dev/commands", {
      success: Schema.Array(DevCommandView),
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/local-dev/commands", {
      payload: NewDevCommand,
      success: DevCommand,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/local-dev/commands/:id", {
      params: DevCommandIdParam,
      success: DevCommand,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PATCH")("update", "/local-dev/commands/:id", {
      params: DevCommandIdParam,
      payload: UpdateDevCommand,
      success: DevCommand,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/local-dev/commands/:id", {
      params: DevCommandIdParam,
      success: Ok,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("start", "/local-dev/commands/:id/start", {
      params: DevCommandIdParam,
      success: DevCommandView,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("stop", "/local-dev/commands/:id/stop", {
      params: DevCommandIdParam,
      success: Ok,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("startAll", "/local-dev/start-all", {
      success: Schema.Array(DevCommandView),
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("stopAll", "/local-dev/stop-all", {
      success: Ok,
      error: errors,
    })
  ) {}
