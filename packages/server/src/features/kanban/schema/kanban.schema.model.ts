/**
 * Kanban schemas — a Trello-style board stored locally in `.byconvo/kanban.json`
 * inside the selected repository. Each card gets a short, stable `key`
 * (e.g. "T-3") so it can be referenced from a terminal thread.
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
})
export type Board = typeof Board.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
