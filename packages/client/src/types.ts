/**
 * API payload types — mirror of @codediff/core's domain.ts.
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

export interface CommitInfo {
  readonly sha: string
  readonly shortSha: string
  readonly author: string
  readonly authoredAt: string
  readonly subject: string
  readonly refs: ReadonlyArray<string>
}

export interface FilesPayload {
  readonly paths: ReadonlyArray<string>
  readonly gitStatus: ReadonlyArray<GitStatusEntry>
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

export interface WorkspaceInfo {
  readonly current: string | null
  readonly recents: ReadonlyArray<string>
  readonly home: string
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
export type BrowseView = {
  readonly kind: "commit"
  readonly sha: string
  readonly shortSha: string
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
