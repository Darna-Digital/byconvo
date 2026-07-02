import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { CHAT_MODEL_CATALOG } from "../providers.ts"
import { ChatsService } from "../service/chats.service.ts"

const ok = { ok: true } as const
const defaults = CHAT_MODEL_CATALOG.defaults

export const ChatsController = HttpApiBuilder.group(Api, "chats", (handlers) =>
  handlers
    .handle("list", () => Effect.flatMap(ChatsService, (s) => s.list))
    .handle("models", () => Effect.flatMap(ChatsService, (s) => s.models))
    .handle("create", ({ payload }) =>
      Effect.flatMap(ChatsService, (s) =>
        s.create({
          title: payload.title ?? "",
          provider: payload.provider ?? defaults.provider,
          model: payload.model ?? defaults.model,
          effort: payload.effort ?? defaults.effort,
          access: payload.access ?? defaults.access,
          mode: payload.mode ?? defaults.mode,
          branch: payload.branch ?? "",
        })
      )
    )
    .handle("get", ({ params }) =>
      Effect.flatMap(ChatsService, (s) => s.get(params.id))
    )
    .handle("update", ({ params, payload }) =>
      Effect.flatMap(ChatsService, (s) =>
        s.update(params.id, {
          title: payload.title,
          model: payload.model,
          effort: payload.effort,
          access: payload.access,
          mode: payload.mode,
        })
      )
    )
    .handle("send", ({ params, payload }) =>
      Effect.flatMap(ChatsService, (s) => s.send(params.id, payload.text))
    )
    .handle("stop", ({ params }) =>
      // ok:false = nothing was running (already settled) — not an error.
      Effect.flatMap(ChatsService, (s) => s.stop(params.id))
    )
    .handle("remove", ({ params }) =>
      Effect.flatMap(ChatsService, (s) => s.remove(params.id)).pipe(
        Effect.as(ok)
      )
    )
)
