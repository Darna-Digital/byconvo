import { useCallback, useEffect, useState } from "react"
import { api } from "../api"
import type { BrowsePayload, WorkspaceInfo } from "../types"

interface RepoPickerProps {
  workspace: WorkspaceInfo
  /** When there is no repository yet the dialog cannot be dismissed. */
  dismissable: boolean
  onClose: () => void
  onSelected: (workspace: WorkspaceInfo) => void
}

const shortenHome = (path: string, home: string): string =>
  path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path

export function RepoPicker({ workspace, dismissable, onClose, onSelected }: RepoPickerProps) {
  const [listing, setListing] = useState<BrowsePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const navigate = useCallback((path: string | null) => {
    setError(null)
    api.browse(path).then(setListing).catch((cause: Error) => setError(cause.message))
  }, [])

  useEffect(() => {
    navigate(workspace.current ?? null)
  }, [navigate, workspace.current])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dismissable, onClose])

  const openRepo = useCallback((path: string) => {
    setBusy(true)
    setError(null)
    api.setWorkspace(path)
      .then((updated) => {
        setBusy(false)
        onSelected(updated)
      })
      .catch((cause: Error) => {
        setBusy(false)
        setError(cause.message)
      })
  }, [onSelected])

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissable) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-label="Open repository">
        <div className="modal-header">
          <span>Open repository</span>
          {dismissable && (
            <button type="button" className="icon-button" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>

        {workspace.recents.length > 0 && (
          <>
            <div className="modal-section-title">Recent</div>
            <div className="recents">
              {workspace.recents.map((path) => (
                <button
                  key={path}
                  type="button"
                  className={`recent-row ${path === workspace.current ? "current" : ""}`}
                  disabled={busy}
                  onClick={() => openRepo(path)}
                >
                  <span className="repo-name">{path.split("/").at(-1)}</span>
                  <span className="repo-path">{shortenHome(path, workspace.home)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="modal-section-title">Browse</div>
        <div className="browser">
          <div className="browser-toolbar">
            <button
              type="button"
              className="icon-button"
              disabled={listing?.parent == null}
              onClick={() => navigate(listing?.parent ?? null)}
              title="Up one level"
            >
              ↑
            </button>
            <span className="browser-path">
              {listing !== null ? shortenHome(listing.path, workspace.home) : "…"}
            </span>
            {listing?.isGitRepo === true && (
              <button
                type="button"
                className="open-button"
                disabled={busy}
                onClick={() => openRepo(listing.path)}
              >
                Open this repo
              </button>
            )}
          </div>
          <div className="browser-list">
            {listing?.entries.map((entry) => (
              <div key={entry.path} className="browser-row">
                <button
                  type="button"
                  className="browser-dir"
                  onClick={() => navigate(entry.path)}
                >
                  <span aria-hidden>{entry.isGitRepo ? "◉" : "▸"}</span>
                  <span className="name">{entry.name}</span>
                </button>
                {entry.isGitRepo && (
                  <button
                    type="button"
                    className="open-button"
                    disabled={busy}
                    onClick={() => openRepo(entry.path)}
                  >
                    Open
                  </button>
                )}
              </div>
            ))}
            {listing !== null && listing.entries.length === 0 && (
              <div className="empty-note">No folders here.</div>
            )}
          </div>
        </div>

        {error !== null && <div className="modal-error">{error}</div>}
      </div>
    </div>
  )
}
