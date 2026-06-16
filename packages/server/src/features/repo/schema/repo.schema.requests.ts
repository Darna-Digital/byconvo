/** Request payloads / query params / path params for the git endpoints. */
import * as Schema from "effect/Schema"

/** `git log` filters as they arrive on the query string (all optional). */
export const LogQueryParams = Schema.Struct({
  ref: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.String),
  author: Schema.optionalKey(Schema.String),
  grep: Schema.optionalKey(Schema.String),
  regex: Schema.optionalKey(Schema.String),
  case: Schema.optionalKey(Schema.String),
  after: Schema.optionalKey(Schema.String),
  before: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
})

/** Selects which diff to render: a commit, a range, or (neither) the worktree. */
export const DiffQuery = Schema.Struct({
  commit: Schema.optionalKey(Schema.String),
  base: Schema.optionalKey(Schema.String),
  head: Schema.optionalKey(Schema.String),
})

export const CommitParam = Schema.Struct({ sha: Schema.String })

export const Checkout = Schema.Struct({ branch: Schema.String })

export const CommitBody = Schema.Struct({
  message: Schema.String,
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

/** Generate a commit message for the given changed paths (empty = all). */
export const GenerateMessageBody = Schema.Struct({
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

export const Merge = Schema.Struct({ branch: Schema.String })
export const Rebase = Schema.Struct({ onto: Schema.String })

/** Selects a conflicted file (query param for fetching its index stages). */
export const ConflictParam = Schema.Struct({ path: Schema.String })

/**
 * Resolve a conflicted file. `ours`/`theirs` check out that side; `content`
 * stages whatever the client has already written to disk (see PUT /api/file).
 */
export const ResolveConflict = Schema.Struct({
  path: Schema.String,
  resolution: Schema.Literals(["ours", "theirs", "content"]),
})

export const CreateBranch = Schema.Struct({
  name: Schema.String,
  startPoint: Schema.optionalKey(Schema.String),
})
export const RenameBranch = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
})
export const DeleteBranch = Schema.Struct({
  name: Schema.String,
  force: Schema.optionalKey(Schema.Boolean),
})

/** The structured log query the repository consumes (built from LogQueryParams). */
export interface LogQuery {
  readonly ref: string
  readonly limit: number
  readonly author: string | null
  readonly grep: string | null
  readonly regex: boolean
  readonly caseSensitive: boolean
  readonly after: string | null
  readonly before: string | null
  readonly path: string | null
}
