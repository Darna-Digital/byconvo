import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { killChatSession } from "../../../layers/acp/acp-socket.ts"
import { ChatsService } from "../service/chats.service.ts"

const ok = { ok: true } as const

export const ChatsController = HttpApiBuilder.group(Api, "chats", (handlers) =>
  handlers
    .handle("list", () => Effect.flatMap(ChatsService, (s) => s.list))
    .handle("create", ({ payload }) =>
      Effect.flatMap(ChatsService, (s) =>
        s.create({
          title: payload.title ?? "",
          agent: payload.agent ?? "claude",
          branch: payload.branch ?? "",
          taskKey: payload.taskKey ?? null,
          initialPrompt: payload.initialPrompt ?? "",
        })
      )
    )
    .handle("get", ({ params }) =>
      Effect.flatMap(ChatsService, (s) => s.get(params.id))
    )
    .handle("rename", ({ params, payload }) =>
      Effect.flatMap(ChatsService, (s) =>
        s.rename(params.id, {
          title: payload.title,
          branch: payload.branch,
          taskKey: payload.taskKey,
        })
      )
    )
    .handle("remove", ({ params }) =>
      // Tear down the live ACP subprocess (if any) FIRST, best-effort, so that
      // even if the record delete then fails the chat can never leave an
      // orphaned agent behind; sessions otherwise outlive their socket.
      Effect.sync(() => killChatSession(params.id)).pipe(
        Effect.flatMap(() =>
          Effect.flatMap(ChatsService, (s) => s.remove(params.id))
        ),
        Effect.as(ok)
      )
    )
)
