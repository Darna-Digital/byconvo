/**
 * Domain type aliases derived from the generated OpenAPI schema. The server's
 * Effect Schema is the single source of truth — these names just give the SPA
 * readable handles (RepoInfo, BranchInfo, …) instead of deep `paths[...]` casts.
 */
import type { paths } from "./schema"

type Json<R> = R extends { content: { "application/json": infer J } }
  ? J
  : never
type Ok<Op> = Op extends { responses: { 200: infer R } } ? Json<R> : never

export type WorkspaceInfo = Ok<paths["/api/workspace"]["get"]>
export type BrowsePayload = Ok<paths["/api/fs/browse"]["get"]>
export type FileContent = Ok<paths["/api/file"]["get"]>
export type RepoEntry = WorkspaceInfo["childRepos"][number]
export type BrowseEntry = BrowsePayload["entries"][number]

export type RepoInfo = Ok<paths["/api/repo"]["get"]>
export type FilesPayload = Ok<paths["/api/files"]["get"]>
export type GitStatusEntry = FilesPayload["gitStatus"][number]
export type GitFileStatus = GitStatusEntry["status"]
export type RepoStatus = Ok<paths["/api/status"]["get"]>
export type BranchInfo = Ok<paths["/api/branches"]["get"]>[number]
export type RemoteBranchInfo = Ok<paths["/api/remote-branches"]["get"]>[number]
export type CommitInfo = Ok<paths["/api/log"]["get"]>[number]
export type CommitDetail = Ok<paths["/api/commit/{sha}"]["get"]>
export type CommitFileChange = CommitDetail["files"][number]

export type ReviewComment = Ok<paths["/api/comments"]["get"]>[number]
export type CommentSide = ReviewComment["side"]

export type PullRequestInfo = Ok<paths["/api/github/pulls"]["get"]>[number]

/** Log-filter state shared by the toolbar and the route search params. */
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
  path: null,
}

/** The three top-level IDE modes (also the top-level route segments). */
export type AppMode = "commit" | "review" | "browse"

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
