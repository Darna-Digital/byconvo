import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { TasksService } from "../service/tasks.service.ts"

const ok = { ok: true } as const

export const TasksController = HttpApiBuilder.group(Api, "tasks", (handlers) =>
  handlers
    .handle("board", () => Effect.flatMap(TasksService, (s) => s.board))
    .handle("listTasks", () => Effect.flatMap(TasksService, (s) => s.listTasks))
    .handle("resolveTask", ({ params }) =>
      Effect.flatMap(TasksService, (s) => s.resolveTask(params.ref))
    )
    .handle("setPrefix", ({ payload }) =>
      Effect.flatMap(TasksService, (s) => s.setPrefix(payload.prefix))
    )
    .handle("create", ({ payload }) =>
      Effect.flatMap(TasksService, (s) =>
        s.create({
          title: payload.title,
          description: payload.description ?? "",
          column: payload.column ?? "todo",
        })
      )
    )
    .handle("update", ({ params, payload }) =>
      Effect.flatMap(TasksService, (s) =>
        s.update(params.id, {
          title: payload.title,
          description: payload.description,
          column: payload.column,
          order: payload.order,
        })
      )
    )
    .handle("remove", ({ params }) =>
      Effect.flatMap(TasksService, (s) => s.remove(params.id)).pipe(
        Effect.as(ok)
      )
    )
    .handle("addColumn", ({ payload }) =>
      Effect.flatMap(TasksService, (s) => s.addColumn(payload.name))
    )
    .handle("updateColumn", ({ params, payload }) =>
      Effect.flatMap(TasksService, (s) =>
        s.updateColumn(params.id, {
          name: payload.name,
          order: payload.order,
        })
      )
    )
    .handle("removeColumn", ({ params }) =>
      Effect.flatMap(TasksService, (s) => s.removeColumn(params.id))
    )
    .handle("addComment", ({ params, payload }) =>
      Effect.flatMap(TasksService, (s) =>
        s.addComment(params.id, payload.body, payload.parentId ?? null)
      )
    )
    .handle("removeComment", ({ params }) =>
      Effect.flatMap(TasksService, (s) =>
        s.removeComment(params.id, params.commentId)
      )
    )
    .handle("resolveComment", ({ params }) =>
      Effect.flatMap(TasksService, (s) => s.resolveComment(params.commentId))
    )
)
