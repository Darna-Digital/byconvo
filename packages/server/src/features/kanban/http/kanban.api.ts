import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import { Board, Card, Ok } from "../schema/kanban.schema.model.ts"
import {
  CardIdParam,
  NewCard,
  SetPrefix,
  TaskRefParam,
  UpdateCard,
} from "../schema/kanban.schema.requests.ts"

const errors = [NoRepoSelected, NotFound, StorageError] as const

export class KanbanApi extends HttpApiGroup.make("kanban")
  .add(
    HttpApiEndpoint.get("board", "/kanban", {
      success: Board,
      error: errors,
    })
  )
  // Agent-facing task API: list all tasks and resolve a free-form reference
  // ("DAR-123", "implement task DAR-123", or a title) to a single task.
  .add(
    HttpApiEndpoint.get("listTasks", "/tasks", {
      success: Schema.Array(Card),
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.get("resolveTask", "/tasks/:ref", {
      params: TaskRefParam,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PUT")("setPrefix", "/kanban/prefix", {
      payload: SetPrefix,
      success: Board,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/kanban/cards", {
      payload: NewCard,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PATCH")("update", "/kanban/cards/:id", {
      params: CardIdParam,
      payload: UpdateCard,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/kanban/cards/:id", {
      params: CardIdParam,
      success: Ok,
      error: errors,
    })
  ) {}
