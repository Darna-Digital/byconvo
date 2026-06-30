import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import {
  Board,
  Card,
  CommentResolution,
  Ok,
} from "../schema/tasks.schema.model.ts"
import {
  CardCommentParams,
  CardIdParam,
  ColumnIdParam,
  CommentIdParam,
  NewCard,
  NewColumn,
  NewComment,
  SetPrefix,
  TaskRefParam,
  UpdateCard,
  UpdateColumn,
} from "../schema/tasks.schema.requests.ts"

const errors = [NoRepoSelected, NotFound, StorageError] as const

export class TasksApi extends HttpApiGroup.make("tasks")
  .add(
    HttpApiEndpoint.get("board", "/tasks/board", {
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
    HttpApiEndpoint.get("resolveTask", "/tasks/resolve/:ref", {
      params: TaskRefParam,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PUT")("setPrefix", "/tasks/prefix", {
      payload: SetPrefix,
      success: Board,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.post("create", "/tasks/cards", {
      payload: NewCard,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PATCH")("update", "/tasks/cards/:id", {
      params: CardIdParam,
      payload: UpdateCard,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("remove", "/tasks/cards/:id", {
      params: CardIdParam,
      success: Ok,
      error: errors,
    })
  )
  // Status columns (dynamic) — add / rename+reorder / delete. Each returns the
  // updated board so the client re-renders columns and cards in one round-trip.
  .add(
    HttpApiEndpoint.post("addColumn", "/tasks/columns", {
      payload: NewColumn,
      success: Board,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("PATCH")("updateColumn", "/tasks/columns/:id", {
      params: ColumnIdParam,
      payload: UpdateColumn,
      success: Board,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")("removeColumn", "/tasks/columns/:id", {
      params: ColumnIdParam,
      success: Board,
      error: errors,
    })
  )
  // Comments on a task. Each comment is independently resolvable by id so its
  // link can be handed to an agent (resolveComment returns the comment + task).
  .add(
    HttpApiEndpoint.post("addComment", "/tasks/cards/:id/comments", {
      params: CardIdParam,
      payload: NewComment,
      success: Card,
      error: errors,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")(
      "removeComment",
      "/tasks/cards/:id/comments/:commentId",
      {
        params: CardCommentParams,
        success: Card,
        error: errors,
      }
    )
  )
  .add(
    HttpApiEndpoint.get("resolveComment", "/tasks/comments/:commentId", {
      params: CommentIdParam,
      success: CommentResolution,
      error: errors,
    })
  ) {}
