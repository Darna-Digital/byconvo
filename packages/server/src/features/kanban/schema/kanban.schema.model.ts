/**
 * Kanban schemas — a Trello-style board stored locally in `.byconvo/kanban.json`
 * inside the selected repository. Each card (task) gets a short, stable `key`
 * with a configurable prefix (e.g. "DAR-3") so it can be referenced from a
 * terminal thread or resolved by an agent through the tasks API.
 */
import * as Schema from "effect/Schema"

export const KanbanColumn = Schema.Literals(["todo", "in_progress", "done"])
export type KanbanColumn = typeof KanbanColumn.Type

export const Card = Schema.Struct({
  id: Schema.String,
  /** Short human reference, e.g. "T-3" — mentionable from threads. */
  key: Schema.String,
  title: Schema.String,
  description: Schema.String,
  column: KanbanColumn,
  /** Sort position within a column (ascending). */
  order: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Card = typeof Card.Type

export const Board = Schema.Struct({
  cards: Schema.Array(Card),
  /** The prefix new card keys are minted with (e.g. "DAR" → "DAR-4"). */
  prefix: Schema.String,
})
export type Board = typeof Board.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
