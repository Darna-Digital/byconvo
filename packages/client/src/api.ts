/**
 * Typed client for the @codediff/core HTTP API.
 */
import type {
  BranchInfo,
  BrowsePayload,
  CommentSide,
  CommitDetail,
  CommitInfo,
  DiffTarget,
  FileContent,
  FilesPayload,
  LogQuery,
  PullRequestInfo,
  RemoteBranchInfo,
  RepoInfo,
  RepoStatus,
  ReviewComment,
  WorkspaceInfo
} from "./types"

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "ApiError"
  }
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(path, init)
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      if (typeof body?.error === "string") detail = body.error
    } catch {
      // not JSON — keep the status text
    }
    throw new ApiError(detail, response.status)
  }
  return response
}

const getJson = async <T>(path: string): Promise<T> => (await request(path)).json()

const getText = async (path: string): Promise<string> => (await request(path)).text()

const sendJson = async <T>(
  method: "POST" | "PUT",
  path: string,
  body: unknown
): Promise<T> => {
  const response = await request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  return response.json()
}

const postJson = <T>(path: string, body: unknown): Promise<T> =>
  sendJson<T>("POST", path, body)

export const api = {
  workspace: () => getJson<WorkspaceInfo>("/api/workspace"),
  setWorkspace: (path: string) => postJson<WorkspaceInfo>("/api/workspace", { path }),
  browse: (path: string | null) =>
    getJson<BrowsePayload>(
      path === null ? "/api/fs/browse" : `/api/fs/browse?path=${encodeURIComponent(path)}`
    ),
  file: (path: string) => getJson<FileContent>(`/api/file?path=${encodeURIComponent(path)}`),
  saveFile: (path: string, contents: string) =>
    sendJson<{ ok: boolean }>("PUT", "/api/file", { path, contents }),
  deletePath: (path: string) =>
    request(`/api/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  renamePath: (from: string, to: string) =>
    postJson<{ ok: boolean }>("/api/file/rename", { from, to }),
  repo: () => getJson<RepoInfo>("/api/repo"),
  files: () => getJson<FilesPayload>("/api/files"),
  status: () => getJson<RepoStatus>("/api/status"),
  branches: () => getJson<ReadonlyArray<BranchInfo>>("/api/branches"),
  remoteBranches: () =>
    getJson<ReadonlyArray<RemoteBranchInfo>>("/api/remote-branches"),
  createBranch: (name: string, startPoint: string | null = null) =>
    postJson<{ ok: boolean }>("/api/branch", { name, startPoint }),
  renameBranch: (from: string, to: string) =>
    postJson<{ ok: boolean }>("/api/branch/rename", { from, to }),
  deleteBranch: (name: string, force = false) =>
    postJson<{ ok: boolean }>("/api/branch/delete", { name, force }),
  fetch: () => postJson<{ output: string }>("/api/fetch", {}),
  merge: (branch: string) => postJson<{ output: string }>("/api/merge", { branch }),
  rebase: (onto: string) => postJson<{ output: string }>("/api/rebase", { onto }),
  log: (ref: string, filters?: LogQuery, limit = 80) => {
    const params = new URLSearchParams({ ref, limit: String(limit) })
    if (filters) {
      if (filters.author !== null) params.set("author", filters.author)
      if (filters.grep !== null) params.set("grep", filters.grep)
      if (filters.regex) params.set("regex", "1")
      if (filters.caseSensitive) params.set("case", "1")
      if (filters.after !== null) params.set("after", filters.after)
      if (filters.before !== null) params.set("before", filters.before)
      if (filters.path !== null) params.set("path", filters.path)
    }
    return getJson<ReadonlyArray<CommitInfo>>(`/api/log?${params.toString()}`)
  },
  commitDetail: (sha: string) =>
    getJson<CommitDetail>(`/api/commit/${encodeURIComponent(sha)}`),
  diff: (target: DiffTarget): Promise<string> => {
    switch (target.kind) {
      case "worktree":
        return getText("/api/diff")
      case "range":
        return getText(
          `/api/diff?base=${encodeURIComponent(target.base)}&head=${encodeURIComponent(target.head)}`
        )
      case "commit":
        return getText(`/api/diff?commit=${encodeURIComponent(target.sha)}`)
      case "pull":
        return getText(`/api/github/pulls/${target.pull.number}/diff`)
    }
  },
  checkout: (branch: string) => postJson<{ ok: boolean }>("/api/checkout", { branch }),
  commit: (message: string, paths: ReadonlyArray<string>) =>
    postJson<{ sha: string }>("/api/commit", { message, paths }),
  push: () => postJson<{ output: string }>("/api/push", {}),
  pull: () => postJson<{ output: string }>("/api/pull", {}),
  comments: () => getJson<ReadonlyArray<ReviewComment>>("/api/comments"),
  addComment: (comment: {
    filePath: string
    side: CommentSide
    lineNumber: number
    body: string
    target: string
  }) => postJson<ReviewComment>("/api/comments", comment),
  deleteComment: (id: string) =>
    request(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pulls: () => getJson<ReadonlyArray<PullRequestInfo>>("/api/github/pulls"),
  pullComments: (pullNumber: number) =>
    getJson<ReadonlyArray<ReviewComment>>(`/api/github/pulls/${pullNumber}/comments`),
  addPullComment: (
    pullNumber: number,
    comment: { filePath: string; side: CommentSide; lineNumber: number; body: string }
  ) => postJson<ReviewComment>(`/api/github/pulls/${pullNumber}/comments`, comment),
  replyToPullComment: (pullNumber: number, commentId: number, body: string) =>
    postJson<ReviewComment>(
      `/api/github/pulls/${pullNumber}/comments/${commentId}/replies`,
      { body }
    )
}
