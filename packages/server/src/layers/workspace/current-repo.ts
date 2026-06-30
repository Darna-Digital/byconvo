/**
 * A plain module-level snapshot of the currently selected repository root.
 *
 * The WorkspaceContext Effect service is the source of truth, but the live PTY
 * WebSocket handler runs outside the Effect runtime (it is wired straight onto
 * the Node HTTP server's `upgrade` event), so it needs a non-Effect way to read
 * the current repo to use as the terminal's working directory. WorkspaceContext
 * keeps this snapshot in sync on boot and on every `select`.
 */
let currentRepo: string | null = null

/** Notified when the selection actually changes, with (next, previous) roots. */
type RepoChangeListener = (next: string | null, prev: string | null) => void
const listeners = new Set<RepoChangeListener>()

/**
 * Subscribe to repository-selection changes. Used by long-lived, non-Effect
 * state outside the request cycle — e.g. the Local Dev process manager stops a
 * repo's running processes when the user switches away from it. Returns an
 * unsubscribe function.
 */
export const onCurrentRepoChange = (
  listener: RepoChangeListener
): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const setCurrentRepo = (path: string | null): void => {
  if (path === currentRepo) return
  const prev = currentRepo
  currentRepo = path
  for (const listener of listeners) {
    try {
      listener(path, prev)
    } catch {
      // a listener must never break selection bookkeeping
    }
  }
}

export const getCurrentRepo = (): string | null => currentRepo
