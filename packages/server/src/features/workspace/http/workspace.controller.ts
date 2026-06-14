import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { WorkspaceService } from "../service/workspace.service.ts"

const ok = { ok: true } as const

export const WorkspaceController = HttpApiBuilder.group(Api, "workspace", (handlers) =>
  handlers
    .handle("info", () => Effect.flatMap(WorkspaceService, (s) => s.info))
    .handle("setCurrent", ({ payload }) =>
      Effect.flatMap(WorkspaceService, (s) => s.setCurrent(payload.path)),
    )
    .handle("browse", ({ query }) =>
      Effect.flatMap(WorkspaceService, (s) => s.browse(query.path ?? null)),
    )
    .handle("readFile", ({ query }) =>
      Effect.flatMap(WorkspaceService, (s) => s.readFile(query.path)),
    )
    .handle("writeFile", ({ payload }) =>
      Effect.flatMap(WorkspaceService, (s) => s.writeFile(payload.path, payload.contents)).pipe(
        Effect.as(ok),
      ),
    )
    .handle("deleteFile", ({ query }) =>
      Effect.flatMap(WorkspaceService, (s) => s.deletePath(query.path)).pipe(Effect.as(ok)),
    )
    .handle("renameFile", ({ payload }) =>
      Effect.flatMap(WorkspaceService, (s) => s.renamePath(payload.from, payload.to)).pipe(
        Effect.as(ok),
      ),
    ),
)
