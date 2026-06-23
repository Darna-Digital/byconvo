/**
 * git-message domain schemas — the AI-drafted commit message and the user's
 * saved commit prefixes (stored globally in ~/.byconvo/prefixes.json).
 */
import * as Schema from "effect/Schema"

/** An AI-generated commit message (from the local `claude` CLI). */
export const GeneratedMessage = Schema.Struct({ message: Schema.String })
export type GeneratedMessage = typeof GeneratedMessage.Type

/**
 * A reusable commit-subject prefix the user has saved (e.g. "feat:", "fix:",
 * "DAR-144:"). `description` is an optional hint shown in the manager and fed
 * to the model so it picks the right one.
 */
export const CommitPrefix = Schema.Struct({
  id: Schema.String,
  value: Schema.String,
  description: Schema.NullOr(Schema.String),
})
export type CommitPrefix = typeof CommitPrefix.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
