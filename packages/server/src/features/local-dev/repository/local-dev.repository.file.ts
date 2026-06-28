/**
 * File-backed dev-command store — persists command definitions to
 * `.byconvo/dev-commands.json` inside the selected repository. Mirrors the
 * terminal-threads file repository.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import { DevCommand } from "../schema/local-dev.schema.model.ts"
import type {
  CreateDevCommandInput,
  DevCommandsRepo,
  UpdateDevCommandInput,
} from "./local-dev.repository.ts"

const DevCommandsFile = Schema.Array(DevCommand)

const commandsPath = (repoPath: string) =>
  `${repoPath}/.byconvo/dev-commands.json`

const readCommands = (repoPath: string): ReadonlyArray<DevCommand> => {
  try {
    const raw = readFileSync(commandsPath(repoPath), "utf8")
    return Schema.decodeUnknownSync(DevCommandsFile)(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

const writeCommands = (
  repoPath: string,
  commands: ReadonlyArray<DevCommand>
) => {
  mkdirSync(`${repoPath}/.byconvo`, { recursive: true })
  writeFileSync(
    commandsPath(repoPath),
    `${JSON.stringify(commands, null, 2)}\n`
  )
}

// Module-scoped so ids stay unique across per-request repository instances.
let counter = 0
const nextId = () => {
  counter += 1
  return `d-${Date.now().toString(36)}-${counter}`
}

export const makeFileDevCommandsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        // A thrown NotFound is a real 404, not a storage failure — preserve it.
        catch: (error) =>
          error instanceof NotFound
            ? error
            : new StorageError({
                reason: error instanceof Error ? error.message : String(error),
              }),
      })
    )

  const requireCommand = (repoPath: string, id: string) => {
    const command = readCommands(repoPath).find((c) => c.id === id)
    if (command === undefined) {
      throw new NotFound({ reason: `dev command ${id} not found` })
    }
    return command
  }

  const list: DevCommandsRepo["list"] = withFile((repoPath) =>
    [...readCommands(repoPath)].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )
  )

  const get: DevCommandsRepo["get"] = (id) =>
    withFile((repoPath) => requireCommand(repoPath, id))

  const create: DevCommandsRepo["create"] = (input: CreateDevCommandInput) =>
    withFile((repoPath) => {
      const now = new Date().toISOString()
      const created: DevCommand = {
        id: nextId(),
        name: input.name.trim(),
        command: input.command.trim(),
        createdAt: now,
        updatedAt: now,
      }
      writeCommands(repoPath, [...readCommands(repoPath), created])
      return created
    })

  const update: DevCommandsRepo["update"] = (
    id,
    input: UpdateDevCommandInput
  ) =>
    withFile((repoPath) => {
      const existing = requireCommand(repoPath, id)
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
        updatedAt: new Date().toISOString(),
      }
      writeCommands(
        repoPath,
        readCommands(repoPath).map((c) => (c.id === id ? updated : c))
      )
      return updated
    })

  const remove: DevCommandsRepo["remove"] = (id) =>
    withFile((repoPath) => {
      writeCommands(
        repoPath,
        readCommands(repoPath).filter((c) => c.id !== id)
      )
    })

  return { list, get, create, update, remove } satisfies DevCommandsRepo
})
