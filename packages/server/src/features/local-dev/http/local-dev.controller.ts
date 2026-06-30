import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type { DevRunStatus } from "../../../layers/terminal/dev-process-manager.ts"
import { DevRuntime } from "../runtime/local-dev.runtime.ts"
import type {
  DevCommand,
  DevCommandView,
} from "../schema/local-dev.schema.model.ts"
import { LocalDevService } from "../service/local-dev.service.ts"

const ok = { ok: true } as const

/** Merge a stored definition with its (optional) runtime status into a view. */
const toView = (
  command: DevCommand,
  status: DevRunStatus | undefined
): DevCommandView => ({
  ...command,
  status: status?.status ?? "stopped",
  exitCode: status?.exitCode ?? null,
})

export const LocalDevController = HttpApiBuilder.group(
  Api,
  "localDev",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const dev = yield* LocalDevService
          const runtime = yield* DevRuntime
          const ctx = yield* WorkspaceContext
          const repoPath = yield* ctx.requireCurrent
          const commands = yield* dev.list
          const statuses = yield* runtime.statuses(repoPath)
          const byId = new Map(statuses.map((s) => [s.commandId, s]))
          return commands.map((command) =>
            toView(command, byId.get(command.id))
          )
        })
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(LocalDevService, (s) =>
          s.create({ name: payload.name, command: payload.command })
        )
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(LocalDevService, (s) => s.get(params.id))
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(LocalDevService, (s) =>
          s.update(params.id, {
            name: payload.name,
            command: payload.command,
          })
        )
      )
      .handle("remove", ({ params }) =>
        Effect.gen(function* () {
          const dev = yield* LocalDevService
          const runtime = yield* DevRuntime
          // Stop a running process before forgetting its definition.
          yield* runtime.stop(params.id)
          yield* dev.remove(params.id)
          return ok
        })
      )
      .handle("start", ({ params }) =>
        Effect.gen(function* () {
          const dev = yield* LocalDevService
          const runtime = yield* DevRuntime
          const ctx = yield* WorkspaceContext
          const repoPath = yield* ctx.requireCurrent
          const command = yield* dev.get(params.id)
          const status = yield* runtime.start({
            commandId: command.id,
            repoPath,
            command: command.command,
          })
          return toView(command, status)
        })
      )
      .handle("stop", ({ params }) =>
        Effect.flatMap(DevRuntime, (r) => r.stop(params.id)).pipe(Effect.as(ok))
      )
      .handle("startAll", () =>
        Effect.gen(function* () {
          const dev = yield* LocalDevService
          const runtime = yield* DevRuntime
          const ctx = yield* WorkspaceContext
          const repoPath = yield* ctx.requireCurrent
          const commands = yield* dev.list
          const views: DevCommandView[] = []
          for (const command of commands) {
            const status = yield* runtime.start({
              commandId: command.id,
              repoPath,
              command: command.command,
            })
            views.push(toView(command, status))
          }
          return views
        })
      )
      .handle("stopAll", () =>
        Effect.gen(function* () {
          const runtime = yield* DevRuntime
          const ctx = yield* WorkspaceContext
          const repoPath = yield* ctx.requireCurrent
          yield* runtime.stopAll(repoPath)
          return ok
        })
      )
)
