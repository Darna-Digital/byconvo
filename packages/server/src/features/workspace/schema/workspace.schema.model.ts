/**
 * Workspace domain schemas — the repository selection surface (which repo is
 * under review, the directory browser, and file read/write for the editor).
 * Effect Schema is the source of truth; the HttpApi validates against these.
 */
import * as Schema from "effect/Schema"

export const RepoEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
})
export type RepoEntry = typeof RepoEntry.Type

export const WorkspaceInfo = Schema.Struct({
  current: Schema.NullOr(Schema.String),
  recents: Schema.Array(Schema.String),
  home: Schema.String,
  /** Whether `current` is itself a git repository. */
  isGitRepo: Schema.Boolean,
  /** Git repos found inside `current` when it is a plain folder (empty otherwise). */
  childRepos: Schema.Array(RepoEntry),
})
export type WorkspaceInfo = typeof WorkspaceInfo.Type

export const BrowseEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  isGitRepo: Schema.Boolean,
})
export type BrowseEntry = typeof BrowseEntry.Type

export const BrowsePayload = Schema.Struct({
  path: Schema.String,
  parent: Schema.NullOr(Schema.String),
  isGitRepo: Schema.Boolean,
  entries: Schema.Array(BrowseEntry),
})
export type BrowsePayload = typeof BrowsePayload.Type

export const FileContent = Schema.Struct({
  name: Schema.String,
  contents: Schema.String,
})
export type FileContent = typeof FileContent.Type

/** Generic acknowledgement for mutating endpoints that return no body. */
export const Ok = Schema.Struct({ ok: Schema.Boolean })
export type Ok = typeof Ok.Type
