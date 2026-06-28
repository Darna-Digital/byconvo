import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { KanbanService } from "../service/kanban.service.ts"

const ok = { ok: true } as const

export const KanbanController = HttpApiBuilder.group(
  Api,
  "kanban",
  (handlers) =>
    handlers
      .handle("board", () => Effect.flatMap(KanbanService, (s) => s.board))
      .handle("listTasks", () =>
        Effect.flatMap(KanbanService, (s) => s.listTasks)
      )
      .handle("resolveTask", ({ params }) =>
        Effect.flatMap(KanbanService, (s) => s.resolveTask(params.ref))
      )
      .handle("setPrefix", ({ payload }) =>
        Effect.flatMap(KanbanService, (s) => s.setPrefix(payload.prefix))
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(KanbanService, (s) =>
          s.create({
            title: payload.title,
            description: payload.description ?? "",
            column: payload.column ?? "todo",
          })
        )
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(KanbanService, (s) =>
          s.update(params.id, {
            title: payload.title,
            description: payload.description,
            column: payload.column,
            order: payload.order,
          })
        )
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(KanbanService, (s) => s.remove(params.id)).pipe(
          Effect.as(ok)
        )
      )
)
