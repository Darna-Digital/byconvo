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
