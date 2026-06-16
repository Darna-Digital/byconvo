import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"
import { fetchClient } from "@/lib/api/client"
import { createGitActionsFunctions } from "../functions/git-actions.functions"
import { errorText, type NoticeKind } from "../entity/git-actions.interfaces"

const unwrap = async <T>(
  p: Promise<{ data?: T; error?: unknown }>
): Promise<T> => {
  const { data, error } = await p
  if (error)
    throw new Error(
      (error as { message?: string; reason?: string }).message ??
        (error as { reason?: string }).reason ??
        "request failed"
    )
  return data as T
}

/**
 * All imperative git actions, wired to the typed API, sonner toasts and
 * TanStack Query invalidation. Components call these; the pure flow logic
 * (commit→push messaging, op notices) lives in the functions layer.
 */
export function useGitActions() {
  const queryClient = useQueryClient()

  const notify = (kind: NoticeKind, text: string) =>
    kind === "ok" ? toast.success(text) : toast.error(text)
  const refresh = () => {
    void queryClient.invalidateQueries()
  }

  const fns = useMemo(
    () =>
      createGitActionsFunctions({
        data: {},
        sideEffects: {
          commit: (message, paths) =>
            unwrap(
              fetchClient.POST("/api/commit", {
                body: { message, paths: [...paths] },
              })
            ),
          push: () => unwrap(fetchClient.POST("/api/push", {})),
          notify,
          refresh,
        },
      }),
    // notify/refresh are stable closures over queryClient
    [queryClient]
  )

  const post =
    <T>(p: Promise<{ data?: T; error?: unknown }>) =>
    () =>
      unwrap(p)

  return {
    commitChanges: fns.commitChanges,

    /**
     * Ask the local Claude Code CLI (Haiku) to draft a commit message for the
     * selected paths. Returns the message, or null when generation failed (the
     * error is surfaced as a toast so callers can simply ignore the null).
     */
    generateCommitMessage: async (
      paths: ReadonlyArray<string>
    ): Promise<string | null> => {
      try {
        const { message } = await unwrap(
          fetchClient.POST("/api/git-message/generate", {
            body: { paths: [...paths] },
          })
        )
        return message
      } catch (cause) {
        notify("err", errorText(cause))
        return null
      }
    },

    checkout: (branch: string) =>
      fns.runOp(`Checked out ${branch}`, () =>
        unwrap(fetchClient.POST("/api/checkout", { body: { branch } }))
      ),

    checkoutAndUpdate: async (branch: string) => {
      try {
        await unwrap(fetchClient.POST("/api/checkout", { body: { branch } }))
        const { output } = await unwrap(fetchClient.POST("/api/pull", {}))
        notify(
          "ok",
          output.length > 0 ? output : `Checked out and updated ${branch}`
        )
        refresh()
      } catch (cause) {
        notify("err", errorText(cause))
      }
    },

    createBranch: (name: string, startPoint: string | null) =>
      fns.runOp(`Created branch ${name}`, () =>
        unwrap(
          fetchClient.POST("/api/branch", {
            body: { name, startPoint: startPoint ?? undefined },
          })
        )
      ),

    renameBranch: (from: string, to: string) =>
      fns.runOp(`Renamed ${from} → ${to}`, () =>
        unwrap(fetchClient.POST("/api/branch/rename", { body: { from, to } }))
      ),

    deleteBranch: (name: string) =>
      fns.runOp(`Deleted ${name}`, () =>
        unwrap(fetchClient.POST("/api/branch/delete", { body: { name } }))
      ),

    merge: (branch: string) =>
      fns.runOp(
        `Merged ${branch}`,
        post(fetchClient.POST("/api/merge", { body: { branch } }))
      ),

    rebase: (onto: string) =>
      fns.runOp(
        `Rebased onto ${onto}`,
        post(fetchClient.POST("/api/rebase", { body: { onto } }))
      ),

    fetch: () => fns.runOp("Fetched", post(fetchClient.POST("/api/fetch", {}))),
    push: () => fns.runOp("Pushed", post(fetchClient.POST("/api/push", {}))),
    pull: () => fns.runOp("Pulled", post(fetchClient.POST("/api/pull", {}))),

    // --- conflicts -----------------------------------------------------------
    /** Resolve a conflicted file by taking one whole side. */
    resolveConflict: (path: string, resolution: "ours" | "theirs") =>
      fns.runOp(`Resolved ${path}`, () =>
        unwrap(
          fetchClient.POST("/api/conflicts/resolve", {
            body: { path, resolution },
          })
        )
      ),

    /** Write the user-merged content, then stage it as resolved. */
    resolveConflictWithContent: async (path: string, contents: string) => {
      try {
        await unwrap(
          fetchClient.PUT("/api/file", { body: { path, contents } })
        )
        await unwrap(
          fetchClient.POST("/api/conflicts/resolve", {
            body: { path, resolution: "content" },
          })
        )
        notify("ok", `Resolved ${path}`)
        refresh()
      } catch (cause) {
        notify("err", errorText(cause))
      }
    },

    abortMerge: () =>
      fns.runOp("Aborted", post(fetchClient.POST("/api/merge/abort", {}))),
    continueMerge: () =>
      fns.runOp("Continued", post(fetchClient.POST("/api/merge/continue", {}))),

    refresh,
  }
}
