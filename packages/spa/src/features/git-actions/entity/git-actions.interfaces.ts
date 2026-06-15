/**
 * `git-actions` feature — the imperative git flows from `App.tsx`: committing
 * (with the commit-then-push partial-failure messaging) and running branch
 * operations (merge/rebase/fetch/…) with a consistent notice + refresh. The
 * messaging is the real logic; the API calls, toast and refresh are injected.
 */
export type NoticeKind = "ok" | "err"

export interface GitActionsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly commit: (
      message: string,
      paths: ReadonlyArray<string>
    ) => Promise<{ sha: string }>
    readonly push: () => Promise<{ output: string }>
    readonly notify: (kind: NoticeKind, text: string) => void
    readonly refresh: () => void
  }
}

export interface GitActionsFunctions {
  /** Commit the given paths and optionally push; reports the outcome. Returns
   * whether the commit itself succeeded (a failed push still returns true). */
  readonly commitChanges: (
    message: string,
    paths: ReadonlyArray<string>,
    andPush: boolean
  ) => Promise<boolean>
  /** Run a branch operation, surfacing its output (or `label`) and refreshing. */
  readonly runOp: (
    label: string,
    op: () => Promise<{ output?: string } | unknown>
  ) => Promise<void>
}

export const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)
