import type { BranchInfo, DiffTarget, RepoInfo } from "../types"

interface TopBarProps {
  repo: RepoInfo | null
  branches: ReadonlyArray<BranchInfo>
  target: DiffTarget
  theme: "light" | "dark"
  onTargetChange: (target: DiffTarget) => void
  onThemeToggle: () => void
  onRefresh: () => void
  onRepoClick: () => void
  onPush: () => void
  onPull: () => void
  opBusy: boolean
}

export function TopBar({
  repo,
  branches,
  target,
  theme,
  onTargetChange,
  onThemeToggle,
  onRefresh,
  onRepoClick,
  onPush,
  onPull,
  opBusy
}: TopBarProps) {
  const mode = target.kind === "commit" ? "worktree" : target.kind
  const current = branches.find((branch) => branch.isCurrent)

  const defaultBase = branches.find((b) => b.name === "main" || b.name === "master")?.name
    ?? branches.at(0)?.name
  const defaultHead = repo?.currentBranch ?? branches.at(0)?.name

  return (
    <header className="topbar">
      <div className="brand">
        codediff<span className="dot">.sh</span>
      </div>
      <button
        type="button"
        className="repo-chip"
        onClick={onRepoClick}
        title="Switch repository"
      >
        {repo !== null
          ? (
            <>
              <span>{repo.name}</span>
              <span aria-hidden>·</span>
              <span className="branch">{repo.currentBranch}</span>
            </>
          )
          : <span>Open repository…</span>}
      </button>
      {target.kind === "range" && (
        <div className="compare-pickers">
          <select
            aria-label="Base branch"
            value={target.base}
            onChange={(event) =>
              onTargetChange({ kind: "range", base: event.target.value, head: target.head })}
          >
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
          <span>…</span>
          <select
            aria-label="Head branch"
            value={target.head}
            onChange={(event) =>
              onTargetChange({ kind: "range", base: target.base, head: event.target.value })}
          >
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
        </div>
      )}
      <nav className="mode-tabs" aria-label="Review mode">
        <button
          type="button"
          className={mode === "worktree" ? "active" : ""}
          onClick={() => onTargetChange({ kind: "worktree" })}
        >
          Changes
        </button>
        <button
          type="button"
          className={mode === "range" ? "active" : ""}
          disabled={branches.length === 0}
          onClick={() => {
            if (defaultBase !== undefined && defaultHead !== undefined) {
              onTargetChange({ kind: "range", base: defaultBase, head: defaultHead })
            }
          }}
        >
          Compare
        </button>
        {repo?.github != null && (
          <button
            type="button"
            className={mode === "pull" ? "active" : ""}
            onClick={() => {
              // Selecting a PR happens in the bottom panel; this just hints at it.
            }}
            title="Pick a pull request in the bottom panel"
          >
            Pull Requests
          </button>
        )}
      </nav>
      {repo !== null && (
        <>
          <button
            type="button"
            className="sync-button"
            onClick={onPull}
            disabled={opBusy}
            title="Pull"
          >
            ↓{current !== undefined && current.behind > 0 ? ` ${current.behind}` : ""}
          </button>
          <button
            type="button"
            className="sync-button"
            onClick={onPush}
            disabled={opBusy}
            title="Push"
          >
            ↑{current !== undefined && current.ahead > 0 ? ` ${current.ahead}` : ""}
          </button>
        </>
      )}
      <button type="button" className="icon-button" onClick={onRefresh} title="Refresh">
        ⟳
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onThemeToggle}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
    </header>
  )
}
