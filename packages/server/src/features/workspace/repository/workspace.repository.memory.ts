/** In-memory workspace repository for tests — no filesystem, no git. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NoRepoSelected, StorageError } from "../../../layers/errors.ts"
import type { WorkspaceInfo } from "../schema/workspace.schema.model.ts"
import type { WorkspaceRepo } from "./workspace.repository.ts"

export interface MemoryWorkspaceSeed {
  readonly current?: string | null
  readonly recents?: ReadonlyArray<string>
  readonly files?: Record<string, string>
}

export const makeMemoryWorkspaceRepository = (seed: MemoryWorkspaceSeed = {}) =>
  Effect.gen(function* () {
    const currentRef = yield* Ref.make<string | null>(seed.current ?? null)
    const recentsRef = yield* Ref.make<ReadonlyArray<string>>(
      seed.recents ?? []
    )
    const filesRef = yield* Ref.make<Record<string, string>>({ ...seed.files })

    const infoFrom = (
      current: string | null,
      recents: ReadonlyArray<string>
    ): WorkspaceInfo => ({
      current,
      recents,
      home: "/home/test",
      isGitRepo: current !== null,
      childRepos: [],
    })

    const repo: WorkspaceRepo = {
      info: Effect.gen(function* () {
        return infoFrom(yield* Ref.get(currentRef), yield* Ref.get(recentsRef))
      }),

      setCurrent: (path) =>
        Effect.gen(function* () {
          yield* Ref.set(currentRef, path)
          const recents = yield* Ref.updateAndGet(recentsRef, (existing) =>
            [path, ...existing.filter((entry) => entry !== path)].slice(0, 10)
          )
          return infoFrom(path, recents)
        }),

      browse: (path) =>
        Effect.succeed({
          path: path ?? "/home/test",
          parent: null,
          isGitRepo: false,
          entries: [],
        }),

      readFile: (relPath) =>
        Effect.gen(function* () {
          yield* Ref.get(currentRef).pipe(
            Effect.flatMap((current) =>
              current === null ? Effect.fail(new NoRepoSelected()) : Effect.void
            )
          )
          const files = yield* Ref.get(filesRef)
          const contents = files[relPath]
          if (contents === undefined) {
            return yield* Effect.fail(
              new StorageError({ reason: `no such file: ${relPath}` })
            )
          }
          return { name: relPath.split("/").at(-1) ?? relPath, contents }
        }),

      writeFile: (relPath, contents) =>
        Ref.update(filesRef, (files) => ({ ...files, [relPath]: contents })),

      deletePath: (relPath) =>
        Ref.update(filesRef, (files) => {
          const next = { ...files }
          delete next[relPath]
          return next
        }),

      renamePath: (fromRel, toRel) =>
        Ref.update(filesRef, (files) => {
          const next = { ...files }
          const value = next[fromRel]
          if (value !== undefined) {
            delete next[fromRel]
            next[toRel] = value
          }
          return next
        }),
    }

    return repo
  })
