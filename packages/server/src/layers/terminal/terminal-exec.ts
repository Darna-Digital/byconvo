/**
 * TerminalExec — runs a one-shot shell command in the currently selected
 * repository and captures its output. It is the "connection to the shell" that
 * powers the Threads feature (Zed-style terminal threads): each run is a
 * non-interactive `sh -c <command>`, scoped to the repo so commands inherit its
 * working directory, exactly the way GitExec/ClaudeExec borrow the local CLIs.
 *
 * A command that exits non-zero is NOT a failure — its exit code and stderr are
 * captured in the result so the thread can show them. Only a genuine spawn/IO
 * failure (no shell on PATH) fails the effect with TerminalError.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { TerminalError } from "../errors.ts"
import { WorkspaceContext } from "../workspace/workspace-context.ts"

export interface TerminalResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface TerminalExecShape {
  /**
   * Run `command` through `sh -c` in the selected repo (or the server cwd when
   * none is selected) and capture stdout/stderr/exit code.
   */
  readonly run: (
    command: string
  ) => Effect.Effect<TerminalResult, TerminalError>
}

export class TerminalExec extends Context.Service<
  TerminalExec,
  TerminalExecShape
>()("TerminalExec") {}

export const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const workspace = yield* WorkspaceContext

  const run: TerminalExecShape["run"] = (command) =>
    Effect.scoped(
      Effect.gen(function* () {
        const cwd = yield* workspace.current.pipe(
          Effect.map((root) => root ?? process.cwd())
        )
        const handle = yield* spawner.spawn(
          ChildProcess.make("sh", ["-c", command], { cwd })
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode,
          ],
          { concurrency: "unbounded" }
        )
        return { stdout, stderr, exitCode } satisfies TerminalResult
      })
    ).pipe(
      Effect.catch((error) =>
        Effect.fail(
          new TerminalError({
            reason: `could not run a terminal command — is a POSIX shell on your PATH? (${
              error instanceof Error ? error.message : String(error)
            })`,
          })
        )
      )
    )

  return TerminalExec.of({ run })
})

export const layer: Layer.Layer<
  TerminalExec,
  never,
  ChildProcessSpawner.ChildProcessSpawner | WorkspaceContext
> = Layer.effect(TerminalExec)(make)

/** Test seam: echoes the command back as stdout, never spawning a real shell. */
export const memoryLayer = (
  result: (command: string) => TerminalResult = (command) => ({
    stdout: command,
    stderr: "",
    exitCode: 0,
  })
): Layer.Layer<TerminalExec> =>
  Layer.succeed(TerminalExec)(
    TerminalExec.of({ run: (c) => Effect.succeed(result(c)) })
  )
