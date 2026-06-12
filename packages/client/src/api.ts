/**
 * Typed client for the @codediff/core HTTP API.
 */
import type {
  BranchInfo,
  BrowsePayload,
  CommentSide,
  CommitInfo,
  DiffTarget,
  FileContent,
  FilesPayload,
  PullRequestInfo,
  RepoInfo,
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
  repo: () => getJson<RepoInfo>("/api/repo"),
  files: () => getJson<FilesPayload>("/api/files"),
  branches: () => getJson<ReadonlyArray<BranchInfo>>("/api/branches"),
  log: (ref: string, limit = 60) =>
    getJson<ReadonlyArray<CommitInfo>>(
      `/api/log?ref=${encodeURIComponent(ref)}&limit=${limit}`
    ),
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
  ) => postJson<ReviewComment>(`/api/github/pulls/${pullNumber}/comments`, comment)
}
