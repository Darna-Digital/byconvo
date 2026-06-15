/**
 * WorkspaceContext — the mutable "which repository is being reviewed" state,
 * shared across features (Git exec, comments, GitHub all read the current
 * repo from here). It is the server's analogue of a database connection in the
 * darna-stack: a single infra service the feature repositories build on.
 *
 * The selection is validated against git, persisted to ~/.reviewer/state.json
 * together with a recents list, and seeded at boot from REVIEWER_REPO / cwd.
 * Only primitives (paths) cross this boundary — domain shapes live in the
 * workspace feature's schema.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { homedir } from "node:os"
import { resolve as pathResolve } from "node:path"
import { InvalidRepo, NoRepoSelected } from "../errors.ts"

export interface WorkspaceContextShape {
  /** The selected repo root, or fail with NoRepoSelected when none is set. */
  readonly requireCurrent: Effect.Effect<string, NoRepoSelected>
  /** The selected repo/folder root, or null when nothing is selected. */
  readonly current: Effect.Effect<string | null>
  /** Recently opened repository roots, most-recent first. */
  readonly recents: Effect.Effect<ReadonlyArray<string>>
  /** Record an already-resolved root as the current selection and persist it. */
  readonly select: (root: string) => Effect.Effect<void>
  /** The user's home directory (for the picker's default browse root). */
  readonly home: string
}

export class WorkspaceContext extends Context.Service<
  WorkspaceContext,
  WorkspaceContextShape
>()("WorkspaceContext") {}

const STATE_DIR = `${homedir()}/.reviewer`
const STATE_FILE = `${STATE_DIR}/state.json`
const MAX_RECENTS = 10

interface PersistedState {
  readonly current: string | null
  readonly recents: ReadonlyArray<string>
}

export interface InitialSelection {
  readonly path: string
  /** Explicit (REVIEWER_REPO) beats persisted state; a cwd guess does not. */
  readonly explicit: boolean
}

/** Resolve a path to its repository root, or explain why it isn't one. */
export const validateRepo = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  path: string
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("git", ["-C", path, "rev-parse", "--show-toplevel"])
      )
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      )
      if (exitCode !== 0) {
        return yield* Effect.fail(
          new InvalidRepo({ path, reason: stderr.trim() })
        )
      }
      return stdout.trim()
    })
  )

/**
 * Canonical workspace path for `path`: the git root if it (or an ancestor) is a
 * repo, otherwise the directory itself. Null when it isn't a directory.
 */
export const resolveWorkspace = (
  fs: FileSystem.FileSystem,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  path: string
) =>
  Effect.gen(function* () {
    const stat = yield* fs
      .stat(path)
      .pipe(Effect.catch(() => Effect.succeed(null)))
    if (stat === null || stat.type !== "Directory") return null
    const root = yield* validateRepo(spawner, path).pipe(
      Effect.catch(() => Effect.succeed(null))
    )
    return root ?? pathResolve(path)
  })

export const make = (initial: InitialSelection | null) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const readState: Effect.Effect<PersistedState> = Effect.gen(function* () {
      const present = yield* fs.exists(STATE_FILE)
      if (!present) return { current: null, recents: [] }
      const raw = yield* fs.readFileString(STATE_FILE)
      try {
        const parsed = JSON.parse(raw)
        return {
          current: typeof parsed?.current === "string" ? parsed.current : null,
          recents: Array.isArray(parsed?.recents)
            ? parsed.recents.filter(
                (entry: unknown): entry is string => typeof entry === "string"
              )
            : [],
        }
      } catch {
        return { current: null, recents: [] }
      }
    }).pipe(Effect.catch(() => Effect.succeed({ current: null, recents: [] })))

    const writeState = (state: PersistedState) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(STATE_DIR, { recursive: true })
        yield* fs.writeFileString(STATE_FILE, JSON.stringify(state, null, 2))
      }).pipe(Effect.catch(() => Effect.void))

    const validOrNull = (path: string | null) =>
      path === null ? Effect.succeed(null) : resolveWorkspace(fs, spawner, path)

    // Boot order: explicit REVIEWER_REPO > last workspace used > cwd guess.
    const persisted = yield* readState
    const explicitValid =
      initial !== null && initial.explicit
        ? yield* validOrNull(initial.path)
        : null
    const persistedValid =
      explicitValid === null ? yield* validOrNull(persisted.current) : null
    const fallbackValid =
      explicitValid === null && persistedValid === null
        ? yield* validOrNull(
            initial !== null && !initial.explicit ? initial.path : null
          )
        : null

    const currentRef = yield* Ref.make<string | null>(
      explicitValid ?? persistedValid ?? fallbackValid
    )
    const recentsRef = yield* Ref.make<ReadonlyArray<string>>(persisted.recents)

    const select: WorkspaceContextShape["select"] = (root) =>
      Effect.gen(function* () {
        yield* Ref.set(currentRef, root)
        const recents = yield* Ref.updateAndGet(recentsRef, (existing) =>
          [root, ...existing.filter((entry) => entry !== root)].slice(
            0,
            MAX_RECENTS
          )
        )
        yield* writeState({ current: root, recents })
      })

    return WorkspaceContext.of({
      home: homedir(),
      current: Ref.get(currentRef),
      recents: Ref.get(recentsRef),
      requireCurrent: Ref.get(currentRef).pipe(
        Effect.flatMap((current) =>
          current === null
            ? Effect.fail(new NoRepoSelected())
            : Effect.succeed(current)
        )
      ),
      select,
    })
  })

export const layer = (
  initial: InitialSelection | null
): Layer.Layer<
  WorkspaceContext,
  never,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> => Layer.effect(WorkspaceContext)(make(initial))

/** Test seam: an in-memory context with no filesystem/git/persistence. */
export const makeMemory = (initial: string | null = null) =>
  Effect.gen(function* () {
    const currentRef = yield* Ref.make<string | null>(initial)
    const recentsRef = yield* Ref.make<ReadonlyArray<string>>(
      initial === null ? [] : [initial]
    )
    return WorkspaceContext.of({
      home: "/home/test",
      current: Ref.get(currentRef),
      recents: Ref.get(recentsRef),
      requireCurrent: Ref.get(currentRef).pipe(
        Effect.flatMap((current) =>
          current === null
            ? Effect.fail(new NoRepoSelected())
            : Effect.succeed(current)
        )
      ),
      select: (root) =>
        Effect.gen(function* () {
          yield* Ref.set(currentRef, root)
          yield* Ref.update(recentsRef, (existing) => [
            root,
            ...existing.filter((entry) => entry !== root),
          ])
        }),
    })
  })

export const memoryLayer = (
  initial: string | null = null
): Layer.Layer<WorkspaceContext> =>
  Layer.effect(WorkspaceContext)(makeMemory(initial))
