import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"
import { ClaudeExec } from "../../../layers/claude/claude-exec.ts"
import { GitExec } from "../../../layers/git/git-exec.ts"
import { GitMessageMemory } from "../layer/git-message.layer.memory.ts"
import { GitMessageService } from "./git-message.service.ts"

/** A GitExec stub whose `git diff` returns `diff` and `ls-files` returns []. */
const gitWith = (diff: string) =>
  Layer.effect(GitExec)(
    Effect.succeed(
      GitExec.of({
        run: () => Effect.succeed(diff),
        runVerbose: () => Effect.succeed(""),
        lines: () => Effect.succeed([]),
      })
    )
  )

/** A ClaudeExec stub. By default it echoes the prompt so tests can inspect it. */
const claudeReturning = (reply?: string) =>
  Layer.effect(ClaudeExec)(
    Effect.succeed(
      ClaudeExec.of({
        prompt: (text) => Effect.succeed(reply ?? text),
      })
    )
  )

describe("GitMessageService", () => {
  it.effect("generate drafts a message from the diff", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const message = yield* svc.generate([])
      expect(message).toBe("feat: do the thing")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(
          gitWith("diff --git a b"),
          claudeReturning("feat: do the thing")
        )
      )
    )
  )

  it.effect("generate cleans wrapping quotes from the model output", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const message = yield* svc.generate([])
      expect(message).toBe("fix: trim it")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(
        Layer.mergeAll(gitWith("some diff"), claudeReturning("'fix: trim it'"))
      )
    )
  )

  it.effect("generate steers the prompt with saved prefixes", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      // claude echoes the prompt, so the result should mention the prefix.
      const prompt = yield* svc.generate([])
      expect(prompt).toContain("DAR-144:")
    }).pipe(
      Effect.provide(
        GitMessageMemory([
          { id: "p1", value: "DAR-144:", description: "current ticket" },
        ])
      ),
      Effect.provide(Layer.mergeAll(gitWith("some diff"), claudeReturning()))
    )
  )

  it.effect("generate fails when there are no changes", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const result = yield* Effect.exit(svc.generate([]))
      expect(result._tag).toBe("Failure")
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(Layer.mergeAll(gitWith(""), claudeReturning()))
    )
  )

  it.effect("prefixes can be added, updated and removed", () =>
    Effect.gen(function* () {
      const svc = yield* GitMessageService
      const created = yield* svc.addPrefix("feat:", "a feature")
      expect((yield* svc.prefixes).map((p) => p.value)).toEqual(["feat:"])

      const updated = yield* svc.updatePrefix(created.id, "fix:", null)
      expect(updated.value).toBe("fix:")
      expect(updated.description).toBeNull()

      yield* svc.removePrefix(created.id)
      expect(yield* svc.prefixes).toEqual([])
    }).pipe(
      Effect.provide(GitMessageMemory()),
      Effect.provide(Layer.mergeAll(gitWith(""), claudeReturning()))
    )
  )
})
