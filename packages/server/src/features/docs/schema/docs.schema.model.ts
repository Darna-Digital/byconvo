/**
 * Docs schemas — markdown plans agents (and people) read and write. Each doc is
 * stored as a real `.md` file under `.byconvo/docs/` in the selected repository,
 * so the local `claude` CLI and other tools can read/write them directly on disk.
 */
import * as Schema from "effect/Schema"

/** A doc without its body, for the sidebar list. */
export const DocSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  updatedAt: Schema.String,
})
export type DocSummary = typeof DocSummary.Type

export const Doc = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  updatedAt: Schema.String,
})
export type Doc = typeof Doc.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
