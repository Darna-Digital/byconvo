import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"
import { GitExec } from "../../../layers/git/git-exec.ts"
import {
  memoryLayer as terminalMemory,
  type TerminalResult,
} from "../../../layers/terminal/terminal-exec.ts"
import { GitMessageMemory } from "../layer/git-message.layer.memory.ts"
import { GitMessageService } from "./git-message.service.ts"

/**
 * A GitExec stub: `git diff` returns `diff`, `rev-parse` returns `branch`, and
 * `ls-files` (via `lines`) returns nothing.
 */
const gitWith = (diff: string, branch = "main") =>
  Layer.effect(GitExec)(
    Effect.succeed(
      GitExec.of({
        run: (...args) =>
          Effect.succeed(args[0] === "rev-parse" ? branch : diff),
        runVerbose: () => Effect.succeed(""),
        lines: () => Effect.succeed([]),
      })
    )
  )

/** A TerminalExec stub. By default it echoes the command so tests can inspect
 * the prompt; pass a result to drive success/quotes/failure. */
const agentReturning = (result?: Partial<TerminalResult>) =>
  terminalMemory((command) => ({
    stdout: result?.stdout ?? command,
    stderr: result?.stderr ?? "",
    exitCode: result?.exitCode ?? 0,
  }))

describe("GitMessageService", () => {
  it.effect("generate drafts a message from the diff", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const message = yield* svc.generate([], "claude")
      expect(message).toBe("Add the thing\n\n- did the thing")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(
          gitWith("diff --git a b"),
          agentReturning({ stdout: "Add the thing\n\n- did the thing" })
        )
      )
    )
  )

  it.effect("generate cleans wrapping quotes from the model output", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const message = yield* svc.generate([], "claude")
      expect(message).toBe("trim it")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(
          gitWith("some diff"),
          agentReturning({ stdout: "'trim it'" })
        )
      )
    )
  )

  it.effect("generate prepends the branch issue slug to the prompt", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      // The terminal stub echoes the command (which embeds the prompt), so the
      // slug instruction should be visible in the result.
      const echoed = yield* svc.generate([], "claude")
      expect(echoed).toContain("DAR-144")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(
          gitWith("some diff", "feature/DAR-144-add-thing"),
          agentReturning()
        )
      )
    )
  )

  it.effect("generate fails when there are no changes", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const result = yield* Effect.exit(svc.generate([], "claude"))
      expect(result._tag).toBe("Failure")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(Layer.mergeAll(gitWith(""), agentReturning()))
    )
  )

  it.effect("generate fails when the agent CLI exits non-zero", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const result = yield* Effect.exit(svc.generate([], "opencode"))
      expect(result._tag).toBe("Failure")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(
          gitWith("some diff"),
          agentReturning({ exitCode: 1, stderr: "command not found" })
        )
      )
    )
  )
})
