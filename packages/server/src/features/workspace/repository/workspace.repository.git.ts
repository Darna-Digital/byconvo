/**
 * Git/filesystem-backed workspace repository — the real implementation, the
 * darna-stack ".db" equivalent. Ports the selection / browse / file-IO logic
 * from the old `core/Workspace.ts`, mapping platform errors to StorageError.
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcessSpawner } from "effect/unstable/process"
import { homedir } from "node:os"
import { resolve as pathResolve } from "node:path"
import { InvalidRepo, NoRepoSelected, StorageError } from "../../../layers/errors.ts"
import { resolveWorkspace, WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type {
  BrowseEntry,
  BrowsePayload,
  RepoEntry,
  WorkspaceInfo,
} from "../schema/workspace.schema.model.ts"
import type { WorkspaceRepo } from "./workspace.repository.ts"

const toStorageError = (error: PlatformError) => new StorageError({ reason: error.message })

export const makeGitWorkspaceRepository = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const ctx = yield* WorkspaceContext

  const tryFs = <A, R>(effect: Effect.Effect<A, PlatformError, R>) =>
    effect.pipe(Effect.mapError(toStorageError))

  /** Git repos within `dir`, searched up to `depth` levels deep. */
  const scanChildRepos = (dir: string, depth: number): Effect.Effect<Array<RepoEntry>> =>
    Effect.gen(function* () {
      const names = yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed([])))
      const repos: Array<RepoEntry> = []
      for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
        if (name.startsWith(".") || name === "node_modules") continue
        const childPath = `${dir}/${name}`
        const stat = yield* fs.stat(childPath).pipe(Effect.catch(() => Effect.succeed(null)))
        if (stat === null || stat.type !== "Directory") continue
        const isGitRepo = yield* fs
          .exists(`${childPath}/.git`)
          .pipe(Effect.catch(() => Effect.succeed(false)))
        if (isGitRepo) {
          repos.push({ name, path: childPath })
          continue
        }
        if (depth > 1) {
          const nested = yield* scanChildRepos(childPath, depth - 1)
          for (const repo of nested) repos.push({ name: `${name}/${repo.name}`, path: repo.path })
        }
      }
      return repos
    })

  const describe = (
    current: string | null,
  ): Effect.Effect<{ isGitRepo: boolean; childRepos: ReadonlyArray<RepoEntry> }> =>
    current === null
      ? Effect.succeed({ isGitRepo: false, childRepos: [] })
      : Effect.gen(function* () {
          const isGitRepo = yield* fs
            .exists(`${current}/.git`)
            .pipe(Effect.catch(() => Effect.succeed(false)))
          if (isGitRepo) return { isGitRepo: true, childRepos: [] }
          const childRepos = yield* scanChildRepos(current, 2)
          return { isGitRepo: false, childRepos }
        })

  const info: WorkspaceRepo["info"] = Effect.gen(function* () {
    const current = yield* ctx.current
    const recents = yield* ctx.recents
    const described = yield* describe(current)
    return { current, recents, home: homedir(), ...described } satisfies WorkspaceInfo
  })

  const setCurrent: WorkspaceRepo["setCurrent"] = (path) =>
    Effect.gen(function* () {
      const root = yield* resolveWorkspace(fs, spawner, path).pipe(Effect.mapError(toStorageError))
      if (root === null) {
        return yield* Effect.fail(new InvalidRepo({ path, reason: "not a directory" }))
      }
      yield* ctx.select(root)
      const recents = yield* ctx.recents
      const described = yield* describe(root)
      return { current: root, recents, home: homedir(), ...described } satisfies WorkspaceInfo
    })

  const browse: WorkspaceRepo["browse"] = (requested) =>
    Effect.gen(function* () {
      const path = requested ?? homedir()
      const names = yield* tryFs(fs.readDirectory(path))
      const entries: Array<BrowseEntry> = []
      for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
        if (name.startsWith(".") || name === "node_modules") continue
        const childPath = `${path}/${name}`
        const stat = yield* fs.stat(childPath).pipe(Effect.catch(() => Effect.succeed(null)))
        if (stat === null || stat.type !== "Directory") continue
        const isGitRepo = yield* fs
          .exists(`${childPath}/.git`)
          .pipe(Effect.catch(() => Effect.succeed(false)))
        entries.push({ name, path: childPath, isGitRepo })
      }
      const parent = path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/"
      const isGitRepo = yield* fs
        .exists(`${path}/.git`)
        .pipe(Effect.catch(() => Effect.succeed(false)))
      return { path, parent, isGitRepo, entries } satisfies BrowsePayload
    })

  /** Resolve a repo-relative path, refusing anything that escapes the root. */
  const resolveInRepo = (relPath: string) =>
    Effect.gen(function* () {
      const root = yield* ctx.requireCurrent
      const cleaned = relPath.replace(/^\/+/, "")
      const resolved = pathResolve(`${root}/${cleaned}`)
      if (resolved !== root && !resolved.startsWith(`${root}/`)) {
        return yield* Effect.fail(new NoRepoSelected())
      }
      return { resolved, name: cleaned.split("/").at(-1) ?? cleaned }
    })

  const readFile: WorkspaceRepo["readFile"] = (relPath) =>
    Effect.gen(function* () {
      const { name, resolved } = yield* resolveInRepo(relPath)
      const contents = yield* tryFs(fs.readFileString(resolved))
      return { name, contents }
    })

  const writeFile: WorkspaceRepo["writeFile"] = (relPath, contents) =>
    Effect.gen(function* () {
      const { resolved } = yield* resolveInRepo(relPath)
      yield* tryFs(fs.writeFileString(resolved, contents))
    })

  const deletePath: WorkspaceRepo["deletePath"] = (relPath) =>
    Effect.gen(function* () {
      const { resolved } = yield* resolveInRepo(relPath)
      yield* tryFs(fs.remove(resolved, { recursive: true }))
    })

  const renamePath: WorkspaceRepo["renamePath"] = (fromRel, toRel) =>
    Effect.gen(function* () {
      const from = yield* resolveInRepo(fromRel)
      const to = yield* resolveInRepo(toRel)
      const parent = to.resolved.slice(0, to.resolved.lastIndexOf("/"))
      if (parent.length > 0) yield* tryFs(fs.makeDirectory(parent, { recursive: true }))
      yield* tryFs(fs.rename(from.resolved, to.resolved))
    })

  return { info, setCurrent, browse, readFile, writeFile, deletePath, renamePath } satisfies WorkspaceRepo
})
