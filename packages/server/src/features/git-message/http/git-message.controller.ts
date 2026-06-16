import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { GitMessageService } from "../service/git-message.service.ts"

const ok = { ok: true } as const
const trimmedOrNull = (value: string | undefined): string | null =>
  value !== undefined && value.trim().length > 0 ? value.trim() : null

export const GitMessageController = HttpApiBuilder.group(
  Api,
  "gitMessage",
  (handlers) =>
    handlers
      .handle("generate", ({ payload }) =>
        Effect.flatMap(GitMessageService, (s) =>
          s.generate(payload.paths ?? [])
        ).pipe(Effect.map((message) => ({ message })))
      )
      .handle("listPrefixes", () =>
        Effect.flatMap(GitMessageService, (s) => s.prefixes)
      )
      .handle("addPrefix", ({ payload }) =>
        Effect.flatMap(GitMessageService, (s) =>
          s.addPrefix(payload.value.trim(), trimmedOrNull(payload.description))
        )
      )
      .handle("updatePrefix", ({ params, payload }) =>
        Effect.flatMap(GitMessageService, (s) =>
          s.updatePrefix(
            params.id,
            payload.value.trim(),
            trimmedOrNull(payload.description)
          )
        )
      )
      .handle("removePrefix", ({ params }) =>
        Effect.flatMap(GitMessageService, (s) =>
          s.removePrefix(params.id)
        ).pipe(Effect.as(ok))
      )
)
