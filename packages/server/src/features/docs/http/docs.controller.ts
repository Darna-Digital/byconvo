import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { DocsService } from "../service/docs.service.ts"

const ok = { ok: true } as const

export const DocsController = HttpApiBuilder.group(Api, "docs", (handlers) =>
  handlers
    .handle("list", () => Effect.flatMap(DocsService, (s) => s.list))
    .handle("create", ({ payload }) =>
      Effect.flatMap(DocsService, (s) => s.create(payload.title))
    )
    .handle("get", ({ params }) =>
      Effect.flatMap(DocsService, (s) => s.get(params.id))
    )
    .handle("update", ({ params, payload }) =>
      Effect.flatMap(DocsService, (s) => s.update(params.id, payload.content))
    )
    .handle("remove", ({ params }) =>
      Effect.flatMap(DocsService, (s) => s.remove(params.id)).pipe(
        Effect.as(ok)
      )
    )
)
