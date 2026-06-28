/**
 * Shared TanStack Query hooks over the typed API client. Route loaders use
 * `api.queryOptions(...)`; components use these hooks. Centralising them keeps
 * query keys consistent so mutations/invalidation hit the right caches.
 */
import { api } from "@/lib/api/client"
import type { DiffTarget, LogQuery } from "@/lib/api/types"

export const useWorkspace = () => api.useQuery("get", "/api/workspace")
export const useRepo = () => api.useQuery("get", "/api/repo")
export const useFiles = () => api.useQuery("get", "/api/files")
export const useStatus = () => api.useQuery("get", "/api/status")
export const useBranches = () => api.useQuery("get", "/api/branches")
export const useRemoteBranches = () =>
  api.useQuery("get", "/api/remote-branches")
export const useComments = () => api.useQuery("get", "/api/comments")
export const useCommitPrefixes = () =>
  api.useQuery("get", "/api/git-message/prefixes")

/** The in-progress merge/rebase operation and its remaining conflicts. */
export const useMergeState = () => api.useQuery("get", "/api/merge-state")

// --- Threads / Docs / Kanban (workspace features) --------------------------

export const useThreads = () => api.useQuery("get", "/api/threads")

export const useThread = (id: string | null) =>
  api.useQuery(
    "get",
    "/api/threads/{id}",
    { params: { path: { id: id ?? "" } } },
    { enabled: id !== null }
  )

export const useDocs = () => api.useQuery("get", "/api/docs")

export const useDoc = (id: string | null) =>
  api.useQuery(
    "get",
    "/api/docs/{id}",
    { params: { path: { id: id ?? "" } } },
    { enabled: id !== null }
  )

export const useKanban = () => api.useQuery("get", "/api/kanban")

/** Saved Local Dev commands for the selected repo, with their runtime status. */
export const useDevCommands = () =>
  api.useQuery("get", "/api/local-dev/commands")

/** The base/ours/theirs index stages of a conflicted file. */
export const useConflictBlobs = (path: string | null) =>
  api.useQuery(
    "get",
    "/api/conflict",
    { params: { query: { path: path ?? "" } } },
    { enabled: path !== null }
  )

export const usePulls = (enabled: boolean) =>
  api.useQuery("get", "/api/github/pulls", {}, { enabled })

export const useCommitDetail = (sha: string | null) =>
  api.useQuery(
    "get",
    "/api/commit/{sha}",
    { params: { path: { sha: sha ?? "" } } },
    {
      enabled: sha !== null,
    }
  )

export const usePullComments = (pullNumber: number | null) =>
  api.useQuery(
    "get",
    "/api/github/pulls/{number}/comments",
    { params: { path: { number: String(pullNumber ?? "") } } },
    { enabled: pullNumber !== null }
  )

/** Commit log for a ref with the active filters. */
export const useLog = (ref: string | null, filters: LogQuery, limit = 80) => {
  const query: Record<string, string> = {
    ref: ref ?? "HEAD",
    limit: String(limit),
  }
  if (filters.author !== null) query["author"] = filters.author
  if (filters.grep !== null) query["grep"] = filters.grep
  if (filters.regex) query["regex"] = "1"
  if (filters.caseSensitive) query["case"] = "1"
  if (filters.after !== null) query["after"] = filters.after
  if (filters.before !== null) query["before"] = filters.before
  if (filters.path !== null) query["path"] = filters.path
  return api.useQuery(
    "get",
    "/api/log",
    { params: { query } },
    { enabled: ref !== null }
  )
}

/** The right diff for the current target (worktree / commit / range / PR). */
export const useDiffText = (target: DiffTarget | null) => {
  const worktree = api.useQuery(
    "get",
    "/api/diff",
    {},
    {
      enabled: target?.kind === "worktree",
    }
  )
  const commit = api.useQuery(
    "get",
    "/api/diff",
    {
      params: {
        query: { commit: target?.kind === "commit" ? target.sha : "" },
      },
    },
    { enabled: target?.kind === "commit" }
  )
  const range = api.useQuery(
    "get",
    "/api/diff",
    {
      params: {
        query:
          target?.kind === "range"
            ? { base: target.base, head: target.head }
            : { base: "", head: "" },
      },
    },
    { enabled: target?.kind === "range" }
  )
  const pull = api.useQuery(
    "get",
    "/api/github/pulls/{number}/diff",
    {
      params: {
        path: {
          number: target?.kind === "pull" ? String(target.pull.number) : "",
        },
      },
    },
    { enabled: target?.kind === "pull" }
  )

  switch (target?.kind) {
    case "worktree":
      return worktree
    case "commit":
      return commit
    case "range":
      return range
    case "pull":
      return pull
    default:
      return worktree
  }
}

export const useFile = (path: string | null) =>
  api.useQuery(
    "get",
    "/api/file",
    { params: { query: { path: path ?? "" } } },
    // A file read either succeeds or it doesn't — retrying a missing/unreadable
    // path (e.g. a staged-then-deleted "AD" ghost that has no worktree content)
    // just hangs the viewer on "Loading", so fail fast and surface the error.
    { enabled: path !== null, retry: false }
  )
