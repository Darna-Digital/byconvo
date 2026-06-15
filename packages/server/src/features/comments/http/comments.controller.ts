import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { CommentsService } from "../service/comments.service.ts"

const ok = { ok: true } as const

export const CommentsController = HttpApiBuilder.group(
  Api,
  "comments",
  (handlers) =>
    handlers
      .handle("list", () => Effect.flatMap(CommentsService, (s) => s.list))
      .handle("add", ({ payload }) =>
        Effect.flatMap(CommentsService, (s) =>
          s.add({
            filePath: payload.filePath,
            side: payload.side,
            lineNumber: payload.lineNumber,
            body: payload.body,
            author:
              payload.author !== undefined && payload.author.length > 0
                ? payload.author
                : "you",
            target: payload.target ?? "worktree",
          })
        )
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(CommentsService, (s) => s.remove(params.id)).pipe(
          Effect.as(ok)
        )
      )
)
