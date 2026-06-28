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

export const setCurrentRepo = (path: string | null): void => {
  currentRepo = path
}

export const getCurrentRepo = (): string | null => currentRepo
