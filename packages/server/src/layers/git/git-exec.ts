/**
 * GitExec — runs the `git` CLI in the currently selected repository. The
 * server's "connection to git": feature repositories build their queries on
 * top of `run` / `runVerbose` / `lines` exactly as the darna-stack DB
 * repositories build on `RawSql`.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { GitError, NoRepoSelected } from "../errors.ts"
import { WorkspaceContext } from "../workspace/workspace-context.ts"

export type GitFailure = GitError | NoRepoSelected

export interface GitExecShape {
  /** Run a git command, returning stdout; fails with GitError on non-zero exit. */
  readonly run: (...args: ReadonlyArray<string>) => Effect.Effect<string, GitFailure>
  /** Like `run` but folds stderr into the result — for push/pull progress. */
  readonly runVerbose: (...args: ReadonlyArray<string>) => Effect.Effect<string, GitFailure>
  /** `run` split into non-empty lines. */
  readonly lines: (...args: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<string>, GitFailure>
}

export class GitExec extends Context.Service<GitExec, GitExecShape>()("GitExec") {}

export const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const workspace = yield* WorkspaceContext

  const spawn = (
    args: ReadonlyArray<string>,
  ): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }, GitFailure> =>
    Effect.scoped(
      Effect.gen(function* () {
        const repoPath = yield* workspace.requireCurrent
        const handle = yield* spawner.spawn(
          ChildProcess.make("git", args as Array<string>, { cwd: repoPath }),
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode,
          ],
          { concurrency: "unbounded" },
        )
        return { stdout, stderr, exitCode }
      }),
    ).pipe(
      // Spawn/IO failures (git missing, decode errors) become GitError so the
      // public error channel stays schema-friendly; NoRepoSelected passes through.
      Effect.catch((error): Effect.Effect<never, GitFailure> =>
        Effect.fail(
          error instanceof NoRepoSelected
            ? error
            : new GitError({
                args,
                exitCode: -1,
                stderr: error instanceof Error ? error.message : String(error),
              }),
        ),
      ),
    )

  const run: GitExecShape["run"] = (...args) =>
    spawn(args).pipe(
      Effect.flatMap(({ exitCode, stderr, stdout }) =>
        exitCode !== 0
          ? Effect.fail(new GitError({ args, exitCode, stderr }))
          : Effect.succeed(stdout),
      ),
    )

  const runVerbose: GitExecShape["runVerbose"] = (...args) =>
    spawn(args).pipe(
      Effect.flatMap(({ exitCode, stderr, stdout }) =>
        exitCode !== 0
          ? Effect.fail(new GitError({ args, exitCode, stderr }))
          : Effect.succeed(`${stdout}${stderr}`.trim()),
      ),
    )

  const lines: GitExecShape["lines"] = (...args) =>
    run(...args).pipe(Effect.map((out) => out.split("\n").filter((line) => line.length > 0)))

  return GitExec.of({ run, runVerbose, lines })
})

export const layer: Layer.Layer<
  GitExec,
  never,
  ChildProcessSpawner.ChildProcessSpawner | WorkspaceContext
> = Layer.effect(GitExec)(make)
