/**
 * Git domain schemas — repo info, file status, branches, commits, the
 * status-bar snapshot. Effect Schema port of the old `core/domain.ts`.
 */
import * as Schema from "effect/Schema"

export const GitFileStatus = Schema.Literals([
  "added",
  "deleted",
  "ignored",
  "modified",
  "renamed",
  "untracked",
])
export type GitFileStatus = typeof GitFileStatus.Type

export const GitStatusEntry = Schema.Struct({
  path: Schema.String,
  status: GitFileStatus,
})
export type GitStatusEntry = typeof GitStatusEntry.Type

export const GitHubRemote = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
})

export const RepoInfo = Schema.Struct({
  root: Schema.String,
  name: Schema.String,
  currentBranch: Schema.String,
  remoteUrl: Schema.NullOr(Schema.String),
  github: Schema.NullOr(GitHubRemote),
})
export type RepoInfo = typeof RepoInfo.Type

export const BranchInfo = Schema.Struct({
  name: Schema.String,
  sha: Schema.String,
  isCurrent: Schema.Boolean,
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
  committedAt: Schema.String,
  subject: Schema.String,
})
export type BranchInfo = typeof BranchInfo.Type

export const RemoteBranchInfo = Schema.Struct({
  name: Schema.String,
  remote: Schema.String,
  shortName: Schema.String,
  sha: Schema.String,
  committedAt: Schema.String,
  subject: Schema.String,
})
export type RemoteBranchInfo = typeof RemoteBranchInfo.Type

export const CommitInfo = Schema.Struct({
  sha: Schema.String,
  shortSha: Schema.String,
  author: Schema.String,
  authoredAt: Schema.String,
  subject: Schema.String,
  refs: Schema.Array(Schema.String),
  parents: Schema.Array(Schema.String),
})
export type CommitInfo = typeof CommitInfo.Type

export const CommitFileChange = Schema.Struct({
  path: Schema.String,
  status: GitFileStatus,
  oldPath: Schema.NullOr(Schema.String),
})
export type CommitFileChange = typeof CommitFileChange.Type

export const CommitDetail = Schema.Struct({
  sha: Schema.String,
  shortSha: Schema.String,
  author: Schema.String,
  authorEmail: Schema.String,
  authoredAt: Schema.String,
  subject: Schema.String,
  body: Schema.String,
  refs: Schema.Array(Schema.String),
  parents: Schema.Array(Schema.String),
  files: Schema.Array(CommitFileChange),
  containingBranches: Schema.Array(Schema.String),
})
export type CommitDetail = typeof CommitDetail.Type

export const FilesPayload = Schema.Struct({
  paths: Schema.Array(Schema.String),
  gitStatus: Schema.Array(GitStatusEntry),
})
export type FilesPayload = typeof FilesPayload.Type

export const RepoStatus = Schema.Struct({
  branch: Schema.String,
  upstream: Schema.NullOr(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
  headSha: Schema.String,
  changed: Schema.Number,
  staged: Schema.Number,
  unstaged: Schema.Number,
  untracked: Schema.Number,
  conflicted: Schema.Number,
})
export type RepoStatus = typeof RepoStatus.Type

/** Output of a porcelain command (push/pull/fetch/merge/rebase). */
export const CommandOutput = Schema.Struct({ output: Schema.String })

/** Result of a commit — the new short sha. */
export const CommitResult = Schema.Struct({ sha: Schema.String })

/** An AI-generated commit message (from the local `claude` CLI). */
export const GeneratedMessage = Schema.Struct({ message: Schema.String })
export type GeneratedMessage = typeof GeneratedMessage.Type

/** Raw unified diff text. */
export const DiffText = Schema.String

export const Ok = Schema.Struct({ ok: Schema.Boolean })
