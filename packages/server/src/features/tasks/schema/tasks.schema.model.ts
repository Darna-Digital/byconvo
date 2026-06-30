/**
 * Tasks schemas — a Trello-style board stored locally in `.byconvo/tasks.json`
 * inside the selected repository. Each card (task) gets a short, stable `key`
 * with a configurable prefix (e.g. "DAR-3") so it can be referenced from a
 * terminal thread or resolved by an agent through the tasks API.
 */
import * as Schema from "effect/Schema"

/** A column (status) id — free-form, since statuses are user-defined. */
export const TasksColumn = Schema.String
export type TasksColumn = typeof TasksColumn.Type

/**
 * A comment on a task. Each has a globally-unique id so it can be referenced on
 * its own — copy its link and hand it to an agent to work on (resolved through
 * GET /api/tasks/comments/:commentId).
 */
export const Comment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
  /** The comment this is a reply to, or null for a top-level comment. */
  parentId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})
export type Comment = typeof Comment.Type

/** A user-defined status column on the board. */
export const Column = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** Left-to-right position (ascending). */
  order: Schema.Number,
})
export type Column = typeof Column.Type

/** The default columns seeded for a new board. */
export const DEFAULT_COLUMNS: ReadonlyArray<Column> = [
  { id: "todo", name: "To do", order: 0 },
  { id: "in_progress", name: "In progress", order: 1 },
  { id: "done", name: "Done", order: 2 },
]

export const Card = Schema.Struct({
  id: Schema.String,
  /** Short human reference, e.g. "T-3" — mentionable from threads. */
  key: Schema.String,
  title: Schema.String,
  description: Schema.String,
  /** The id of the column (status) this card sits in. */
  column: TasksColumn,
  /** Sort position within a column (ascending). */
  order: Schema.Number,
  /** Notes/instructions on the task, each independently referenceable. */
  comments: Schema.Array(Comment),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Card = typeof Card.Type

export const Board = Schema.Struct({
  cards: Schema.Array(Card),
  /** The board's status columns, in display order. */
  columns: Schema.Array(Column),
  /** The prefix new card keys are minted with (e.g. "DAR" → "DAR-4"). */
  prefix: Schema.String,
})
export type Board = typeof Board.Type

/** A comment resolved with its owning task — what an agent gets from a comment link. */
export const CommentResolution = Schema.Struct({
  card: Card,
  comment: Comment,
})
export type CommentResolution = typeof CommentResolution.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
