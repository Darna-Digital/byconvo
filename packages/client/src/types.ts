/**
 * API payload types — mirror of @reviewer/core's domain.ts.
 */

export type GitFileStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked"

export interface GitStatusEntry {
  readonly path: string
  readonly status: GitFileStatus
}

export interface RepoInfo {
  readonly root: string
  readonly name: string
  readonly currentBranch: string
  readonly remoteUrl: string | null
  readonly github: { readonly owner: string; readonly repo: string } | null
}

export interface BranchInfo {
  readonly name: string
  readonly sha: string
  readonly isCurrent: boolean
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  readonly committedAt: string
  readonly subject: string
}

export interface RemoteBranchInfo {
  /** Full short ref, e.g. "origin/feature". */
  readonly name: string;
  /** The remote it belongs to, e.g. "origin". */
  readonly remote: string;
  /** The branch name without the remote prefix, e.g. "feature". */
  readonly shortName: string;
  readonly sha: string;
  readonly committedAt: string;
  readonly subject: string;
}

export interface CommitInfo {
  readonly sha: string
  readonly shortSha: string
  readonly author: string
  readonly authoredAt: string
  readonly subject: string
  readonly refs: ReadonlyArray<string>
  /** Full parent SHAs — drives the commit-graph lane layout. */
  readonly parents: ReadonlyArray<string>
}

export interface CommitFileChange {
  readonly path: string
  readonly status: GitFileStatus
  readonly oldPath: string | null
}

export interface CommitDetail {
  readonly sha: string
  readonly shortSha: string
  readonly author: string
  readonly authorEmail: string
  readonly authoredAt: string
  readonly subject: string
  readonly body: string
  readonly refs: ReadonlyArray<string>
  readonly parents: ReadonlyArray<string>
  readonly files: ReadonlyArray<CommitFileChange>
  readonly containingBranches: ReadonlyArray<string>
}

/** Log filter state shared by the toolbar and the API client. */
export interface LogQuery {
  readonly author: string | null
  readonly grep: string | null
  readonly regex: boolean
  readonly caseSensitive: boolean
  readonly after: string | null
  readonly before: string | null
  readonly path: string | null
}

export const emptyLogQuery: LogQuery = {
  author: null,
  grep: null,
  regex: false,
  caseSensitive: false,
  after: null,
  before: null,
  path: null
}

export interface FilesPayload {
  readonly paths: ReadonlyArray<string>
  readonly gitStatus: ReadonlyArray<GitStatusEntry>
}

/** Compact working-tree snapshot for the status bar (see core's domain.ts). */
export interface RepoStatus {
  readonly branch: string
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  readonly headSha: string
  readonly changed: number
  readonly staged: number
  readonly unstaged: number
  readonly untracked: number
  readonly conflicted: number
}

export type CommentSide = "deletions" | "additions"

export interface ReviewComment {
  readonly id: string
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
  readonly body: string
  readonly author: string
  readonly createdAt: string
  readonly target: string
  readonly source: "local" | "github"
}

export interface RepoEntry {
  readonly name: string
  readonly path: string
}

export interface WorkspaceInfo {
  readonly current: string | null
  readonly recents: ReadonlyArray<string>
  readonly home: string
  /** Whether `current` is itself a git repository. */
  readonly isGitRepo: boolean
  /** Git repos found inside `current` when it is a plain folder (empty otherwise). */
  readonly childRepos: ReadonlyArray<RepoEntry>
}

export interface BrowseEntry {
  readonly name: string
  readonly path: string
  readonly isGitRepo: boolean
}

export interface BrowsePayload {
  readonly path: string
  readonly parent: string | null
  readonly isGitRepo: boolean
  readonly entries: ReadonlyArray<BrowseEntry>
}

export interface PullRequestInfo {
  readonly number: number
  readonly title: string
  readonly author: string
  readonly baseRef: string
  readonly headRef: string
  readonly headSha: string
  readonly url: string
  readonly updatedAt: string
}

export interface FileContent {
  readonly name: string
  readonly contents: string
}

/** The three top-level IDE modes, switched from the vertical tool rail. */
export type AppMode = "commit" | "review" | "browse"

/** What the center pane shows while in browse mode (files open in the editor). */
export type BrowseView =
  | {
      readonly kind: "commit"
      readonly sha: string
      readonly shortSha: string
    }
  | {
      /** Compare two refs, e.g. a branch against the current one. */
      readonly kind: "range"
      readonly base: string
      readonly head: string
    }

/** What the center pane is currently diffing. */
export type DiffTarget =
  | { readonly kind: "worktree" }
  | { readonly kind: "range"; readonly base: string; readonly head: string }
  | { readonly kind: "commit"; readonly sha: string; readonly shortSha: string }
  | { readonly kind: "pull"; readonly pull: PullRequestInfo }

export const diffTargetKey = (target: DiffTarget): string => {
  switch (target.kind) {
    case "worktree":
      return "worktree"
    case "range":
      return `${target.base}...${target.head}`
    case "commit":
      return `commit-${target.sha}`
    case "pull":
      return `pr-${target.pull.number}`
  }
}
