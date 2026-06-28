/**
 * Local Dev schemas — JetBrains-style "run configurations" for a repository,
 * stored locally in `.byconvo/dev-commands.json`. A dev command is a named shell
 * command (e.g. `pnpm dev`) that runs from the selected repo root and can be
 * started/stopped individually or all at once. It keeps running across page
 * navigation; see the DevProcessManager for the runtime side.
 */
import * as Schema from "effect/Schema"

/** A saved dev-command definition (the persisted CRUD entity). */
export const DevCommand = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  command: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type DevCommand = typeof DevCommand.Type

/** Runtime state of a command's process. */
export const DevCommandStatus = Schema.Literals(["stopped", "running", "exited"])
export type DevCommandStatus = typeof DevCommandStatus.Type

/** A command definition plus its live runtime status, returned to the SPA. */
export const DevCommandView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  command: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  status: DevCommandStatus,
  /** Exit code when `status` is `exited`, else null. */
  exitCode: Schema.NullOr(Schema.Number),
})
export type DevCommandView = typeof DevCommandView.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
