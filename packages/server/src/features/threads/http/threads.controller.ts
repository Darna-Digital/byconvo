import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { killPtySession } from "../../../layers/terminal/pty-socket.ts"
import { ThreadsService } from "../service/threads.service.ts"

const ok = { ok: true } as const

export const ThreadsController = HttpApiBuilder.group(
  Api,
  "threads",
  (handlers) =>
    handlers
      .handle("list", () => Effect.flatMap(ThreadsService, (s) => s.list))
      .handle("create", ({ payload }) =>
        Effect.flatMap(ThreadsService, (s) =>
          s.create({
            title: payload.title ?? "",
            agent: payload.agent ?? "terminal",
            branch: payload.branch ?? "",
            taskKey: payload.taskKey ?? null,
            initialPrompt: payload.initialPrompt ?? "",
          })
        )
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(ThreadsService, (s) => s.get(params.id))
      )
      .handle("rename", ({ params, payload }) =>
        Effect.flatMap(ThreadsService, (s) =>
          s.rename(params.id, {
            title: payload.title,
            branch: payload.branch,
            taskKey: payload.taskKey,
          })
        )
      )
      .handle("run", ({ params, payload }) =>
        Effect.flatMap(ThreadsService, (s) => s.run(params.id, payload.command))
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(ThreadsService, (s) => s.remove(params.id)).pipe(
          // Tear down the live PTY (if any) so a deleted thread leaves no
          // orphaned process; sessions otherwise outlive their socket.
          Effect.tap(() => Effect.sync(() => killPtySession(params.id))),
          Effect.as(ok)
        )
      )
)
