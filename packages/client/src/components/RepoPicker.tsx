import { useCallback, useEffect, useMemo, useState } from "react"
import { api } from "../api"
import { desktop } from "../desktop"
import { repoAvatar } from "../repoAvatar"
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

const basename = (path: string): string => path.split("/").filter(Boolean).at(-1) ?? path

interface Crumb {
  readonly label: string
  readonly path: string
}

// Clickable path segments, with the home prefix collapsed to a single "~" so
// you can jump up several levels at once instead of stepping one at a time.
const crumbsFor = (path: string, home: string): ReadonlyArray<Crumb> => {
  const crumbs: Array<Crumb> = [{ label: "/", path: "/" }]
  let acc = ""
  for (const segment of path.split("/").filter(Boolean)) {
    acc += `/${segment}`
    crumbs.push({ label: segment, path: acc })
  }
  if (path === home || path.startsWith(`${home}/`)) {
    const homeDepth = home.split("/").filter(Boolean).length
    return [{ label: "~", path: home }, ...crumbs.slice(1 + homeDepth)]
  }
  return crumbs
}

export function RepoPicker({ workspace, dismissable, onClose, onSelected }: RepoPickerProps) {
  const [view, setView] = useState<"recents" | "browse">(
    workspace.recents.length > 0 ? "recents" : "browse",
  )
  const [query, setQuery] = useState("")
  const [listing, setListing] = useState<BrowsePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const navigate = useCallback((path: string | null) => {
    setError(null)
    api.browse(path).then(setListing).catch((cause: Error) => setError(cause.message))
  }, [])

  useEffect(() => {
    if (view === "browse" && listing === null) navigate(workspace.current ?? null)
  }, [view, listing, navigate, workspace.current])

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

  // "Open" uses the native OS picker in the desktop shell, and the in-app
  // filesystem browser everywhere else.
  const openFolder = useCallback(() => {
    if (desktop === null) {
      setView("browse")
      return
    }
    setError(null)
    desktop
      .openDirectory()
      .then((path) => {
        if (path !== null) openRepo(path)
      })
      .catch((cause: Error) => setError(cause.message))
  }, [openRepo])

  const filteredRecents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return workspace.recents
    return workspace.recents.filter((path) => path.toLowerCase().includes(needle))
  }, [workspace.recents, query])

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissable) onClose()
      }}
    >
      <div className="modal repo-modal" role="dialog" aria-label="Open repository">
        <div className="modal-header">
          {view === "browse" && workspace.recents.length > 0 ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => setView("recents")}
              title="Back to recent projects"
            >
              ‹
            </button>
          ) : (
            <span>Projects</span>
          )}
          <div className="modal-header-actions">
            <button type="button" className="open-button" disabled={busy} onClick={openFolder}>
              Open…
            </button>
            {dismissable && (
              <button type="button" className="icon-button" onClick={onClose} title="Close">
                ✕
              </button>
            )}
          </div>
        </div>

        {view === "recents" ? (
          <>
            <input
              type="search"
              className="repo-search"
              placeholder="Search projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <div className="recents">
              {filteredRecents.map((path) => {
                const avatar = repoAvatar(basename(path))
                return (
                  <button
                    key={path}
                    type="button"
                    className={`recent-row ${path === workspace.current ? "current" : ""}`}
                    disabled={busy}
                    onClick={() => openRepo(path)}
                  >
                    <span className="repo-avatar" style={{ background: avatar.color }}>
                      {avatar.initials}
                    </span>
                    <span className="repo-card-text">
                      <span className="repo-name">{basename(path)}</span>
                      <span className="repo-path">{shortenHome(path, workspace.home)}</span>
                    </span>
                  </button>
                )
              })}
              {filteredRecents.length === 0 && (
                <div className="empty-note">
                  {workspace.recents.length === 0
                    ? "No recent projects — use Open… to pick a folder."
                    : "No projects match your search."}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="browser">
            <div className="quick-access">
              <button type="button" onClick={() => navigate(workspace.home)}>
                Home
              </button>
              <button type="button" onClick={() => navigate(`${workspace.home}/Desktop`)}>
                Desktop
              </button>
              <button type="button" onClick={() => navigate(`${workspace.home}/Documents`)}>
                Documents
              </button>
              <button type="button" onClick={() => navigate("/")}>
                Root
              </button>
            </div>
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
              <div className="browser-crumbs">
                {listing !== null
                  ? crumbsFor(listing.path, workspace.home).map((crumb, index, all) => (
                    <span key={crumb.path} className="crumb">
                      <button type="button" onClick={() => navigate(crumb.path)}>
                        {crumb.label}
                      </button>
                      {index < all.length - 1 && <span className="crumb-sep">/</span>}
                    </span>
                  ))
                  : "…"}
              </div>
              {listing !== null && (
                <button
                  type="button"
                  className="open-button"
                  disabled={busy}
                  onClick={() => openRepo(listing.path)}
                >
                  {listing.isGitRepo ? "Open this repo" : "Open this folder"}
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
                  <button
                    type="button"
                    className="open-button"
                    disabled={busy}
                    onClick={() => openRepo(entry.path)}
                  >
                    Open
                  </button>
                </div>
              ))}
              {listing !== null && listing.entries.length === 0 && (
                <div className="empty-note">No folders here.</div>
              )}
            </div>
          </div>
        )}

        {error !== null && <div className="modal-error">{error}</div>}
      </div>
    </div>
  )
}
