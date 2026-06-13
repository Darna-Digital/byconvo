/**
 * Shared domain types for the reviewer API.
 *
 * These types describe the JSON payloads exchanged between
 * `@reviewer/core` (the Effect backend) and `@reviewer/client`.
 */

export type GitFileStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked";

export interface GitStatusEntry {
  readonly path: string;
  readonly status: GitFileStatus;
}

export interface RepoInfo {
  readonly root: string;
  readonly name: string;
  readonly currentBranch: string;
  readonly remoteUrl: string | null;
  readonly github: { readonly owner: string; readonly repo: string } | null;
}

export interface BranchInfo {
  readonly name: string;
  readonly sha: string;
  readonly isCurrent: boolean;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly committedAt: string;
  readonly subject: string;
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
  readonly sha: string;
  readonly shortSha: string;
  readonly author: string;
  readonly authoredAt: string;
  readonly subject: string;
  readonly refs: ReadonlyArray<string>;
  /** Full parent SHAs — drives the commit-graph lane layout. */
  readonly parents: ReadonlyArray<string>;
}

/** One file touched by a commit, with its change kind. */
export interface CommitFileChange {
  readonly path: string;
  readonly status: GitFileStatus;
  /** The previous path for renames/copies; null otherwise. */
  readonly oldPath: string | null;
}

/** Everything the commit-details panel shows for a single commit. */
export interface CommitDetail {
  readonly sha: string;
  readonly shortSha: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly subject: string;
  readonly body: string;
  readonly refs: ReadonlyArray<string>;
  readonly parents: ReadonlyArray<string>;
  readonly files: ReadonlyArray<CommitFileChange>;
  /** Local and remote branches whose history contains this commit. */
  readonly containingBranches: ReadonlyArray<string>;
}

/** Filters applied to a `git log` query from the log toolbar. */
export interface LogQuery {
  readonly ref: string;
  readonly limit: number;
  readonly author: string | null;
  readonly grep: string | null;
  /** Treat `grep` as a regular expression rather than a fixed string. */
  readonly regex: boolean;
  readonly caseSensitive: boolean;
  /** Git-parseable date bounds, e.g. "2026-01-01" or "2 weeks ago". */
  readonly after: string | null;
  readonly before: string | null;
  /** Limit history to commits touching this path. */
  readonly path: string | null;
}

export interface FilesPayload {
  readonly paths: ReadonlyArray<string>;
  readonly gitStatus: ReadonlyArray<GitStatusEntry>;
}

/**
 * A compact snapshot of the working tree for the status bar — branch, sync
 * state against the upstream, the HEAD sha, and counts of pending changes.
 */
export interface RepoStatus {
  readonly branch: string;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  /** Short HEAD sha, or "" in an empty repository. */
  readonly headSha: string;
  /** Total distinct files with pending changes (staged, unstaged or untracked). */
  readonly changed: number;
  readonly staged: number;
  readonly unstaged: number;
  readonly untracked: number;
  readonly conflicted: number;
}

export type CommentSide = "deletions" | "additions";

export interface ReviewComment {
  readonly id: string;
  readonly filePath: string;
  readonly side: CommentSide;
  readonly lineNumber: number;
  readonly body: string;
  readonly author: string;
  readonly createdAt: string;
  readonly target: string;
  readonly source: "local" | "github";
}

export interface RepoEntry {
  readonly name: string;
  readonly path: string;
}

export interface WorkspaceInfo {
  readonly current: string | null;
  readonly recents: ReadonlyArray<string>;
  readonly home: string;
  /** Whether `current` is itself a git repository. */
  readonly isGitRepo: boolean;
  /** Git repos found inside `current` when it is a plain folder (empty otherwise). */
  readonly childRepos: ReadonlyArray<RepoEntry>;
}

export interface BrowseEntry {
  readonly name: string;
  readonly path: string;
  readonly isGitRepo: boolean;
}

export interface BrowsePayload {
  readonly path: string;
  readonly parent: string | null;
  readonly isGitRepo: boolean;
  readonly entries: ReadonlyArray<BrowseEntry>;
}

export interface FileContent {
  readonly name: string;
  readonly contents: string;
}

export interface PullRequestInfo {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly url: string;
  readonly updatedAt: string;
}
