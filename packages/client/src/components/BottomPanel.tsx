import { useState } from "react"
import type { BranchInfo, CommitInfo, DiffTarget, PullRequestInfo } from "../types"

interface BottomPanelProps {
  branches: ReadonlyArray<BranchInfo>
  commits: ReadonlyArray<CommitInfo>
  pulls: ReadonlyArray<PullRequestInfo>
  pullsError: string | null
  hasGitHub: boolean
  logRef: string | null
  target: DiffTarget
  onLogRefChange: (ref: string) => void
  onBranchCheckout: (branch: string) => Promise<void>
  onTargetChange: (target: DiffTarget) => void
}

const formatDate = (iso: string): string => {
  if (iso.length === 0) return ""
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function BottomPanel({
  branches,
  commits,
  pulls,
  pullsError,
  hasGitHub,
  logRef,
  target,
  onLogRefChange,
  onBranchCheckout,
  onTargetChange
}: BottomPanelProps) {
  const [rightTab, setRightTab] = useState<"log" | "pulls">("log")
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  return (
    <footer className="bottom-panel">
      <div className="branches-pane">
        <div className="panel-title">
          <span>Branches</span>
          {checkoutError !== null && (
            <span style={{ color: "var(--red)", textTransform: "none" }}>{checkoutError}</span>
          )}
        </div>
        <div className="branch-list">
          {branches.map((branch) => (
            <button
              key={branch.name}
              type="button"
              className={`branch-row ${branch.isCurrent ? "current" : ""} ${
                logRef === branch.name ? "selected" : ""
              }`}
              title={`${branch.subject}\nDouble-click to checkout`}
              onClick={() => onLogRefChange(branch.name)}
              onDoubleClick={() => {
                setCheckoutError(null)
                onBranchCheckout(branch.name).catch((error: Error) =>
                  setCheckoutError(error.message)
                )
              }}
            >
              <svg
                className="git-icon"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M4 6v4M6 4.6c3 .8 4 1.6 4.4 1.6" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span className="name">{branch.name}</span>
              {branch.isCurrent && <span className="current-badge">current</span>}
              {(branch.ahead > 0 || branch.behind > 0) && (
                <span className="track">
                  {branch.ahead > 0 ? `↑${branch.ahead}` : ""}
                  {branch.behind > 0 ? ` ↓${branch.behind}` : ""}
                </span>
              )}
            </button>
          ))}
          {branches.length === 0 && <div className="empty-note">No branches found.</div>}
        </div>
      </div>
      <div className="commits-pane">
        <div className="panel-title">
          <span>
            <button
              type="button"
              style={rightTab === "log" ? undefined : { color: "var(--fg-faint)" }}
              onClick={() => setRightTab("log")}
            >
              Log{logRef !== null ? `: ${logRef}` : ""}
            </button>
            {hasGitHub && (
              <button
                type="button"
                style={{
                  marginLeft: 12,
                  ...(rightTab === "pulls" ? {} : { color: "var(--fg-faint)" })
                }}
                onClick={() => setRightTab("pulls")}
              >
                Pull Requests{pulls.length > 0 ? ` (${pulls.length})` : ""}
              </button>
            )}
          </span>
        </div>
        {rightTab === "log"
          ? (
            <div className="commit-list">
              {commits.map((commit) => (
                <button
                  key={commit.sha}
                  type="button"
                  className={`commit-row ${
                    target.kind === "commit" && target.sha === commit.sha ? "selected" : ""
                  }`}
                  title="Click to review this commit"
                  onClick={() =>
                    onTargetChange({
                      kind: "commit",
                      sha: commit.sha,
                      shortSha: commit.shortSha
                    })}
                >
                  <span className="sha">{commit.shortSha}</span>
                  <span className="subject">{commit.subject}</span>
                  {commit.refs.length > 0 && (
                    <span className="refs">
                      {commit.refs.slice(0, 3).map((ref) => (
                        <span key={ref} className="ref-badge">{ref}</span>
                      ))}
                    </span>
                  )}
                  <span className="author">{commit.author}</span>
                  <span className="date">{formatDate(commit.authoredAt)}</span>
                </button>
              ))}
              {commits.length === 0 && <div className="empty-note">No commits to show.</div>}
            </div>
          )
          : (
            <div className="commit-list">
              {pullsError !== null && <div className="empty-note">{pullsError}</div>}
              {pulls.map((pull) => (
                <button
                  key={pull.number}
                  type="button"
                  className={`pull-row ${
                    target.kind === "pull" && target.pull.number === pull.number ? "selected" : ""
                  }`}
                  onClick={() => onTargetChange({ kind: "pull", pull })}
                >
                  <span className="number">#{pull.number}</span>
                  <span className="title">{pull.title}</span>
                  <span className="branches">
                    {pull.headRef} → {pull.baseRef} · {pull.author}
                  </span>
                </button>
              ))}
              {pullsError === null && pulls.length === 0 && (
                <div className="empty-note">No open pull requests.</div>
              )}
            </div>
          )}
      </div>
    </footer>
  )
}
