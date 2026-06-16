/**
 * ClaudeExec — runs the user's locally installed `claude` CLI (Claude Code) in
 * non-interactive print mode. The reviewer never ships an API key: it borrows
 * the developer's own Claude Code install, exactly the way GitExec borrows the
 * `git` CLI. Today it powers commit-message generation; the prompt seam keeps
 * it reusable for any future "ask Claude about this repo" feature.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { ClaudeError } from "../errors.ts"
import { WorkspaceContext } from "../workspace/workspace-context.ts"

export interface ClaudeExecShape {
  /**
   * Run a one-shot prompt through `claude -p` and return its text output.
   * `model` is a Claude Code model alias (e.g. "haiku"). Runs in the selected
   * repository so the CLI inherits its working directory and config.
   */
  readonly prompt: (
    text: string,
    model: string
  ) => Effect.Effect<string, ClaudeError>
}

export class ClaudeExec extends Context.Service<ClaudeExec, ClaudeExecShape>()(
  "ClaudeExec"
) {}

export const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const workspace = yield* WorkspaceContext

  const prompt: ClaudeExecShape["prompt"] = (text, model) =>
    Effect.scoped(
      Effect.gen(function* () {
        // Run in the selected repo when there is one, else the server's cwd.
        const cwd = yield* workspace.current.pipe(
          Effect.map((root) => root ?? process.cwd())
        )
        const handle = yield* spawner.spawn(
          ChildProcess.make(
            "claude",
            ["-p", text, "--model", model, "--output-format", "text"],
            { cwd }
          )
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
            new ClaudeError({
              reason:
                stderr.trim().length > 0
                  ? `claude exited ${exitCode}: ${stderr.trim()}`
                  : `claude exited ${exitCode}`,
            })
          )
        }
        const out = stdout.trim()
        return out.length > 0
          ? out
          : yield* Effect.fail(
              new ClaudeError({ reason: "claude produced no output" })
            )
      })
    ).pipe(
      // A spawn/IO failure usually means the CLI is missing — surface that
      // plainly rather than leaking the raw defect.
      Effect.catch((error) =>
        error instanceof ClaudeError
          ? Effect.fail(error)
          : Effect.fail(
              new ClaudeError({
                reason: `could not run the "claude" CLI — is Claude Code installed and on your PATH? (${
                  error instanceof Error ? error.message : String(error)
                })`,
              })
            )
      )
    )

  return ClaudeExec.of({ prompt })
})

export const layer: Layer.Layer<
  ClaudeExec,
  never,
  ChildProcessSpawner.ChildProcessSpawner | WorkspaceContext
> = Layer.effect(ClaudeExec)(make)
