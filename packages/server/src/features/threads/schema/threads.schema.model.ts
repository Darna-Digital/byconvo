/**
 * Terminal-thread schemas — Zed-style "terminal threads" stored locally in
 * `.byconvo/threads.json` inside the selected repository. A thread is a named,
 * repo-scoped terminal session; each run appends an entry capturing the command
 * and its captured output.
 */
import * as Schema from "effect/Schema"

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
  /** Optional Kanban card key this thread references (cross-feature link). */
  taskKey: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  entries: Schema.Array(ThreadEntry),
})
export type Thread = typeof Thread.Type

/** A thread without its (potentially large) entry history, for the sidebar. */
export const ThreadSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  taskKey: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  entryCount: Schema.Number,
  lastCommand: Schema.NullOr(Schema.String),
})
export type ThreadSummary = typeof ThreadSummary.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
