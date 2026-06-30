/**
 * Terminal-thread schemas — "terminal threads" stored locally in
 * `.byconvo/threads.json` inside the selected repository. A thread is a named,
 * repo-scoped terminal session; each run appends an entry capturing the command
 * and its captured output.
 *
 * A thread is bound to an agent: a plain "terminal" (raw shell), or an agent CLI
 * (Claude Code, opencode, Codex) the developer has installed. Running in an agent
 * thread sends the input as a prompt to that CLI.
 */
import * as Schema from "effect/Schema"

export const AgentKind = Schema.Literals([
  "terminal",
  "claude",
  "opencode",
  "codex",
])
export type AgentKind = typeof AgentKind.Type

export const ThreadEntry = Schema.Struct({
  id: Schema.String,
  command: Schema.String,
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
  createdAt: Schema.String,
})
export type ThreadEntry = typeof ThreadEntry.Type

/** A full thread including its run history. */
export const Thread = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** Which agent runs this thread's input (raw shell or an agent CLI). */
  agent: AgentKind,
  /** The git branch this thread is grouped under (the branch when created). */
  branch: Schema.String,
  /** Optional task key this thread references (cross-feature link). */
  taskKey: Schema.NullOr(Schema.String),
  /** A prompt typed into the agent once it starts, then cleared. Used when a
   * task comment tags an agent — the task + comment are handed to it. */
  initialPrompt: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  entries: Schema.Array(ThreadEntry),
})
export type Thread = typeof Thread.Type

/** A thread without its (potentially large) entry history, for the sidebar. */
export const ThreadSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  agent: AgentKind,
  branch: Schema.String,
  taskKey: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  entryCount: Schema.Number,
  lastCommand: Schema.NullOr(Schema.String),
})
export type ThreadSummary = typeof ThreadSummary.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
