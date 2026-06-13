/**
 * Workspace service — tracks which repository on this machine is being
 * reviewed. The selection is mutable at runtime (set from the UI), validated
 * against git, and persisted to ~/.codediff/state.json together with a list
 * of recently opened repositories.
 */
import { Context, Data, Effect, Layer, Ref, Stream } from "effect"
import * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { homedir } from "node:os"
import { resolve as pathResolve } from "node:path"
import type { BrowseEntry, BrowsePayload, RepoEntry, WorkspaceInfo } from "./domain.js"

export class NoRepoSelected extends Data.TaggedError("NoRepoSelected")<{}> {
  override get message(): string {
    return "no repository selected — pick one with the repository picker"
  }
}

export class InvalidRepo extends Data.TaggedError("InvalidRepo")<{
  readonly path: string
  readonly reason: string
}> {
  override get message(): string {
    return `${this.path} is not a git repository: ${this.reason}`
  }
}

export interface WorkspaceShape {
  readonly info: Effect.Effect<WorkspaceInfo, PlatformError>
  readonly requireCurrent: Effect.Effect<string, NoRepoSelected>
  readonly setCurrent: (
    path: string
  ) => Effect.Effect<WorkspaceInfo, InvalidRepo | PlatformError>
  readonly browse: (path: string | null) => Effect.Effect<BrowsePayload, PlatformError>
  readonly readFile: (
    relPath: string
  ) => Effect.Effect<{ name: string; contents: string }, NoRepoSelected | PlatformError>
  readonly writeFile: (
    relPath: string,
    contents: string
  ) => Effect.Effect<void, NoRepoSelected | PlatformError>
}

export class Workspace extends Context.Service<Workspace, WorkspaceShape>()("Workspace") {}

const STATE_DIR = `${homedir()}/.codediff`
const STATE_FILE = `${STATE_DIR}/state.json`
const MAX_RECENTS = 10

interface PersistedState {
  readonly current: string | null
  readonly recents: ReadonlyArray<string>
}

export interface InitialSelection {
  readonly path: string
  /** Explicit (CODEDIFF_REPO) beats persisted state; a cwd guess does not. */
  readonly explicit: boolean
}

export const make = (initial: InitialSelection | null) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    /** Resolve a path to its repository root, or explain why it isn't one. */
    const validateRepo = (path: string) =>
      Effect.scoped(Effect.gen(function*() {
        const handle = yield* spawner.spawn(
          ChildProcess.make("git", ["-C", path, "rev-parse", "--show-toplevel"])
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode
          ],
          { concurrency: "unbounded" }
        )
        if (exitCode !== 0) {
          return yield* Effect.fail(new InvalidRepo({ path, reason: stderr.trim() }))
        }
        return stdout.trim()
      }))

    /**
     * Canonical workspace path for `path`: the git root if it (or an ancestor)
     * is a repo, otherwise the directory itself. Null when it isn't a directory.
     */
    const resolveWorkspace = (path: string) =>
      Effect.gen(function*() {
        const stat = yield* fs.stat(path).pipe(Effect.catch(() => Effect.succeed(null)))
        if (stat === null || stat.type !== "Directory") return null
        const root = yield* validateRepo(path).pipe(Effect.catch(() => Effect.succeed(null)))
        return root ?? pathResolve(path)
      })

    /** Git repos within `dir`, searched up to `depth` levels deep. */
    const scanChildRepos = (
      dir: string,
      depth: number
    ): Effect.Effect<Array<RepoEntry>, never> =>
      Effect.gen(function*() {
        const names = yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed([])))
        const repos: Array<RepoEntry> = []
        for (const name of names.sort((a, b) => a.localeCompare(b))) {
          if (name.startsWith(".") || name === "node_modules") continue
          const childPath = `${dir}/${name}`
          const stat = yield* fs.stat(childPath).pipe(Effect.catch(() => Effect.succeed(null)))
          if (stat === null || stat.type !== "Directory") continue
          const isGitRepo = yield* fs.exists(`${childPath}/.git`).pipe(
            Effect.catch(() => Effect.succeed(false))
          )
          if (isGitRepo) {
            repos.push({ name, path: childPath })
            continue // don't descend into a repository
          }
          if (depth > 1) {
            const nested = yield* scanChildRepos(childPath, depth - 1)
            // Qualify nested names with their parent so they stay distinguishable.
            for (const repo of nested) repos.push({ name: `${name}/${repo.name}`, path: repo.path })
          }
        }
        return repos
      })

    /** isGitRepo + childRepos for a (possibly null) current workspace path. */
    const describe = (
      current: string | null
    ): Effect.Effect<{ isGitRepo: boolean; childRepos: ReadonlyArray<RepoEntry> }, never> =>
      current === null
        ? Effect.succeed({ isGitRepo: false, childRepos: [] })
        : Effect.gen(function*() {
          const isGitRepo = yield* fs.exists(`${current}/.git`).pipe(
            Effect.catch(() => Effect.succeed(false))
          )
          if (isGitRepo) return { isGitRepo: true, childRepos: [] }
          const childRepos = yield* scanChildRepos(current, 2)
          return { isGitRepo: false, childRepos }
        })

    const readState: Effect.Effect<PersistedState, never> = Effect.gen(function*() {
      const present = yield* fs.exists(STATE_FILE)
      if (!present) return { current: null, recents: [] }
      const raw = yield* fs.readFileString(STATE_FILE)
      try {
        const parsed = JSON.parse(raw)
        return {
          current: typeof parsed?.current === "string" ? parsed.current : null,
          recents: Array.isArray(parsed?.recents)
            ? parsed.recents.filter((entry: unknown): entry is string =>
              typeof entry === "string"
            )
            : []
        }
      } catch {
        return { current: null, recents: [] }
      }
    }).pipe(Effect.catch(() => Effect.succeed({ current: null, recents: [] })))

    const writeState = (state: PersistedState) =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(STATE_DIR, { recursive: true })
        yield* fs.writeFileString(STATE_FILE, JSON.stringify(state, null, 2))
      }).pipe(Effect.catch(() => Effect.void))

    // Boot order: explicit CODEDIFF_REPO > last workspace used > cwd guess.
    // A workspace may be a git repo or a plain folder of repos, so any existing
    // directory is acceptable here.
    const persisted = yield* readState
    const validOrNull = (path: string | null) =>
      path === null ? Effect.succeed(null) : resolveWorkspace(path)

    const explicitValid = initial !== null && initial.explicit
      ? yield* validOrNull(initial.path)
      : null
    const persistedValid = explicitValid === null
      ? yield* validOrNull(persisted.current)
      : null
    const fallbackValid = explicitValid === null && persistedValid === null
      ? yield* validOrNull(initial !== null && !initial.explicit ? initial.path : null)
      : null

    const currentRef = yield* Ref.make<string | null>(
      explicitValid ?? persistedValid ?? fallbackValid
    )
    const recentsRef = yield* Ref.make<ReadonlyArray<string>>(persisted.recents)

    const info: WorkspaceShape["info"] = Effect.gen(function*() {
      const current = yield* Ref.get(currentRef)
      const recents = yield* Ref.get(recentsRef)
      const described = yield* describe(current)
      return { current, recents, home: homedir(), ...described }
    })

    const requireCurrent: WorkspaceShape["requireCurrent"] = Ref.get(currentRef).pipe(
      Effect.flatMap((current) =>
        current === null ? Effect.fail(new NoRepoSelected()) : Effect.succeed(current)
      )
    )

    const setCurrent: WorkspaceShape["setCurrent"] = (path) =>
      Effect.gen(function*() {
        // Accept a git repo (resolved to its root) or any plain folder; only a
        // non-existent / non-directory path is rejected.
        const root = yield* resolveWorkspace(path)
        if (root === null) {
          return yield* Effect.fail(new InvalidRepo({ path, reason: "not a directory" }))
        }
        yield* Ref.set(currentRef, root)
        const recents = yield* Ref.updateAndGet(recentsRef, (existing) =>
          [root, ...existing.filter((entry) => entry !== root)].slice(0, MAX_RECENTS)
        )
        yield* writeState({ current: root, recents })
        const described = yield* describe(root)
        return { current: root, recents, home: homedir(), ...described }
      })

    const browse: WorkspaceShape["browse"] = (requested) =>
      Effect.gen(function*() {
        const path = requested ?? homedir()
        const names = yield* fs.readDirectory(path)
        const entries: Array<BrowseEntry> = []
        for (const name of names.sort((a, b) => a.localeCompare(b))) {
          if (name.startsWith(".") || name === "node_modules") continue
          const childPath = `${path}/${name}`
          const stat = yield* fs.stat(childPath).pipe(
            Effect.catch(() => Effect.succeed(null))
          )
          if (stat === null || stat.type !== "Directory") continue
          const isGitRepo = yield* fs.exists(`${childPath}/.git`).pipe(
            Effect.catch(() => Effect.succeed(false))
          )
          entries.push({ name, path: childPath, isGitRepo })
        }
        const parent = path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/"
        const isGitRepo = yield* fs.exists(`${path}/.git`).pipe(
          Effect.catch(() => Effect.succeed(false))
        )
        return { path, parent, isGitRepo, entries }
      })

    // Resolve a repo-relative path to an absolute one, refusing anything that
    // escapes the repository root.
    const resolveInRepo = (relPath: string) =>
      Effect.gen(function*() {
        const root = yield* requireCurrent
        const cleaned = relPath.replace(/^\/+/, "")
        const resolved = pathResolve(`${root}/${cleaned}`)
        if (resolved !== root && !resolved.startsWith(`${root}/`)) {
          return yield* Effect.fail(new NoRepoSelected())
        }
        return { resolved, name: cleaned.split("/").at(-1) ?? cleaned }
      })

    const readFile: WorkspaceShape["readFile"] = (relPath) =>
      Effect.gen(function*() {
        const { name, resolved } = yield* resolveInRepo(relPath)
        const contents = yield* fs.readFileString(resolved)
        return { name, contents }
      })

    const writeFile: WorkspaceShape["writeFile"] = (relPath, contents) =>
      Effect.gen(function*() {
        const { resolved } = yield* resolveInRepo(relPath)
        yield* fs.writeFileString(resolved, contents)
      })

    return Workspace.of({ info, requireCurrent, setCurrent, browse, readFile, writeFile })
  })

export const layer = (
  initial: InitialSelection | null
): Layer.Layer<
  Workspace,
  never,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(Workspace)(make(initial))
