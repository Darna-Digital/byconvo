/**
 * git-message service — the feature's business logic (railaru: logic belongs in
 * the service, not the repository). It composes three lower layers: GitExec for
 * the diff, the PrefixRepository for the user's saved prefixes, and ClaudeExec
 * to draft the message with Haiku. Prefix CRUD is forwarded to the repository.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { ClaudeExec } from "../../../layers/claude/claude-exec.ts"
import { ClaudeError } from "../../../layers/errors.ts"
import type { GitFailure } from "../../../layers/git/git-exec.ts"
import { GitExec } from "../../../layers/git/git-exec.ts"
import type { CommitPrefix } from "../schema/git-message.schema.model.ts"
import {
  PrefixRepository,
  type PrefixRepo,
} from "../repository/prefix.repository.ts"

/**
 * Haiku from the user's local Claude Code — the cheapest, fastest model, which
 * is plenty for summarizing a diff. The diff is capped so the prompt stays
 * small and the call returns quickly.
 */
const MODEL = "haiku"
const MAX_DIFF_CHARS = 16_000

const BASE_PROMPT = [
  "Write a git commit message for the changes below.",
  "Use a concise, imperative subject line under ~72 characters. Add a short",
  "body only when it explains something the subject cannot. Output ONLY the raw",
  "commit message — no surrounding quotes, no markdown, no code fences, no",
  "preamble or sign-off.",
].join("\n")

/** Render the user's saved prefixes as guidance for the subject line. */
const prefixGuidance = (prefixes: ReadonlyArray<CommitPrefix>): string => {
  if (prefixes.length === 0) {
    return "Prefix the subject with a Conventional Commits type (feat:, fix:, refactor:, docs:, chore:, test:) when one fits."
  }
  const list = prefixes
    .map((p) =>
      p.description !== null && p.description.length > 0
        ? `  ${p.value} — ${p.description}`
        : `  ${p.value}`
    )
    .join("\n")
  return `Begin the subject line with whichever of the user's saved prefixes best fits the change (use it verbatim); only fall back to a Conventional Commits type if none apply:\n${list}`
}

/** Strip code fences or wrapping single/double quotes a model may add anyway. */
const cleanMessage = (raw: string): string => {
  let text = raw.trim()
  const fence = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/)
  if (fence?.[1] !== undefined) text = fence[1].trim()
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1).trim()
  }
  return text
}

export interface GitMessageServiceShape {
  readonly prefixes: PrefixRepo["list"]
  readonly addPrefix: PrefixRepo["add"]
  readonly updatePrefix: PrefixRepo["update"]
  readonly removePrefix: PrefixRepo["remove"]
  readonly generate: (
    paths: ReadonlyArray<string>
  ) => Effect.Effect<string, GitFailure | ClaudeError>
}

export class GitMessageService extends Context.Service<
  GitMessageService,
  GitMessageServiceShape
>()("GitMessageService") {}

export const make = Effect.gen(function* () {
  const { lines, run } = yield* GitExec
  const claude = yield* ClaudeExec
  const prefixesRepo = yield* PrefixRepository

  const generate: GitMessageServiceShape["generate"] = (paths) =>
    Effect.gen(function* () {
      // Working-tree diff vs HEAD for the chosen paths (empty = everything).
      // Tolerate failures (e.g. unborn HEAD) by falling back to an empty diff.
      const diff = yield* run(
        ...(paths.length === 0
          ? ["diff", "HEAD"]
          : ["diff", "HEAD", "--", ...paths])
      ).pipe(Effect.catchTag("GitError", () => Effect.succeed("")))

      // git diff omits untracked files; name them so Claude knows they're new.
      const untracked = yield* lines(
        ...(paths.length === 0
          ? ["ls-files", "--others", "--exclude-standard"]
          : ["ls-files", "--others", "--exclude-standard", "--", ...paths])
      ).pipe(Effect.catchTag("GitError", () => Effect.succeed([] as const)))

      const truncated =
        diff.length > MAX_DIFF_CHARS
          ? `${diff.slice(0, MAX_DIFF_CHARS)}\n…[diff truncated]`
          : diff
      const newFiles =
        untracked.length > 0
          ? `\n\nNew untracked files:\n${untracked.map((f) => `  ${f}`).join("\n")}`
          : ""
      const changes = `${truncated}${newFiles}`.trim()

      if (changes.length === 0) {
        return yield* Effect.fail(
          new ClaudeError({ reason: "no changes to summarize" })
        )
      }

      // Saved prefixes only steer the prompt — never fail generation over them.
      const savedPrefixes = yield* prefixesRepo.list.pipe(
        Effect.catchTag("StorageError", () =>
          Effect.succeed<ReadonlyArray<CommitPrefix>>([])
        )
      )

      const prompt = `${BASE_PROMPT}\n${prefixGuidance(savedPrefixes)}\n\n--- DIFF ---\n${changes}`
      const message = yield* claude.prompt(prompt, MODEL)
      return cleanMessage(message)
    })

  return GitMessageService.of({
    prefixes: prefixesRepo.list,
    addPrefix: prefixesRepo.add,
    updatePrefix: prefixesRepo.update,
    removePrefix: prefixesRepo.remove,
    generate,
  })
})
