/** In-memory dev-command store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import type { DevCommand } from "../schema/local-dev.schema.model.ts"
import type {
  CreateDevCommandInput,
  DevCommandsRepo,
  UpdateDevCommandInput,
} from "./local-dev.repository.ts"

export const makeMemoryDevCommandsRepository = (
  seed: ReadonlyArray<DevCommand> = []
) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<DevCommand>>([...seed])
    let counter = 0
    const nextId = () => {
      counter += 1
      return `d-mem-${counter}`
    }
    const now = () => "2026-01-01T00:00:00.000Z"

    const find = (commands: ReadonlyArray<DevCommand>, id: string) => {
      const command = commands.find((c) => c.id === id)
      if (command === undefined) {
        return Effect.fail(
          new NotFound({ reason: `dev command ${id} not found` })
        )
      }
      return Effect.succeed(command)
    }

    const repo: DevCommandsRepo = {
      list: Ref.get(store).pipe(
        Effect.map((commands) =>
          [...commands].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        )
      ),
      get: (id) =>
        Effect.flatMap(Ref.get(store), (commands) => find(commands, id)),
      create: (input: CreateDevCommandInput) =>
        Effect.gen(function* () {
          const created: DevCommand = {
            id: nextId(),
            name: input.name.trim(),
            command: input.command.trim(),
            createdAt: now(),
            updatedAt: now(),
          }
          yield* Ref.update(store, (all) => [...all, created])
          return created
        }),
      update: (id, input: UpdateDevCommandInput) =>
        Effect.gen(function* () {
          const existing = yield* find(yield* Ref.get(store), id)
          const updated: DevCommand = {
            ...existing,
            name:
              input.name !== undefined && input.name.trim().length > 0
                ? input.name.trim()
                : existing.name,
            command:
              input.command !== undefined && input.command.trim().length > 0
                ? input.command.trim()
                : existing.command,
            updatedAt: now(),
          }
          yield* Ref.update(store, (all) =>
            all.map((c) => (c.id === id ? updated : c))
          )
          return updated
        }),
      remove: (id) =>
        Ref.update(store, (all) => all.filter((c) => c.id !== id)),
    }
    return repo
  })
