/**
 * File-backed commit-prefix store — persists the user's prefixes globally to
 * `~/.byconvo/prefixes.json` (the same dir as the workspace state, so they
 * follow the user across repositories). Mirrors the comments file store:
 * synchronous node:fs calls wrapped in `Effect.try` → `StorageError`.
 */
import * as Effect from "effect/Effect"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import type { CommitPrefix } from "../schema/git-message.schema.model.ts"
import type { PrefixRepo } from "./prefix.repository.ts"

const STATE_DIR = `${homedir()}/.byconvo`
const STATE_FILE = `${STATE_DIR}/prefixes.json`

const readAll = (): Array<CommitPrefix> => {
  let raw: string
  try {
    raw = readFileSync(STATE_FILE, "utf8")
  } catch {
    return [] // No file yet — start empty.
  }
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap(
    (entry): Array<CommitPrefix> =>
      typeof entry?.id === "string" && typeof entry?.value === "string"
        ? [
            {
              id: entry.id,
              value: entry.value,
              description:
                typeof entry.description === "string"
                  ? entry.description
                  : null,
            },
          ]
        : []
  )
}

const writeAll = (prefixes: ReadonlyArray<CommitPrefix>): void => {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(prefixes, null, 2))
}

// Module-scoped so ids stay unique even though the repository is built per
// request (a request-scoped counter would reset and could collide).
let counter = 0

const storageError = (error: unknown): StorageError =>
  new StorageError({
    reason: error instanceof Error ? error.message : String(error),
  })

export const makeFilePrefixRepository = Effect.gen(function* () {
  const list: PrefixRepo["list"] = Effect.try({
    try: readAll,
    catch: storageError,
  })

  const add: PrefixRepo["add"] = (value, description) =>
    Effect.try({
      try: () => {
        counter += 1
        const created: CommitPrefix = {
          id: `p-${Date.now().toString(36)}-${counter}`,
          value,
          description,
        }
        writeAll([...readAll(), created])
        return created
      },
      catch: storageError,
    })

  const update: PrefixRepo["update"] = (id, value, description) =>
    Effect.gen(function* () {
      const all = yield* Effect.try({ try: readAll, catch: storageError })
      const existing = all.find((p) => p.id === id)
      if (existing === undefined) {
        return yield* Effect.fail(
          new NotFound({ reason: `no commit prefix with id ${id}` })
        )
      }
      const updated: CommitPrefix = { id, value, description }
      yield* Effect.try({
        try: () => writeAll(all.map((p) => (p.id === id ? updated : p))),
        catch: storageError,
      })
      return updated
    })

  const remove: PrefixRepo["remove"] = (id) =>
    Effect.gen(function* () {
      const all = yield* Effect.try({ try: readAll, catch: storageError })
      if (!all.some((p) => p.id === id)) {
        return yield* Effect.fail(
          new NotFound({ reason: `no commit prefix with id ${id}` })
        )
      }
      yield* Effect.try({
        try: () => writeAll(all.filter((p) => p.id !== id)),
        catch: storageError,
      })
    })

  return { list, add, update, remove } satisfies PrefixRepo
})
