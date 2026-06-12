import type { BranchInfo, RepoInfo } from "../types";

interface TopBarProps {
  repo: RepoInfo | null;
  branches: ReadonlyArray<BranchInfo>;
  contextLabel: string;
  diffStyle: "split" | "unified";
  showDiffStyleToggle: boolean;
  opBusy: boolean;
  onDiffStyleChange: (style: "split" | "unified") => void;
  onRepoClick: () => void;
  onPush: () => void;
  onPull: () => void;
  onRefresh: () => void;
}

export function TopBar({
  repo,
  branches,
  contextLabel,
  diffStyle,
  showDiffStyleToggle,
  opBusy,
  onDiffStyleChange,
  onRepoClick,
  onPush,
  onPull,
  onRefresh,
}: TopBarProps) {
  const current = branches.find((branch) => branch.isCurrent);

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
        {repo !== null ? (
          <>
            <span>{repo.name}</span>
            <span aria-hidden>·</span>
            <span className="branch">{repo.currentBranch}</span>
          </>
        ) : (
          <span>Open repository…</span>
        )}
      </button>

      <span className="context-label" title={contextLabel}>
        {contextLabel}
      </span>

      {showDiffStyleToggle && (
        <div className="seg-toggle" role="group" aria-label="Diff layout">
          <button
            type="button"
            className={diffStyle === "split" ? "active" : ""}
            onClick={() => onDiffStyleChange("split")}
            title="Side-by-side"
          >
            Split
          </button>
          <button
            type="button"
            className={diffStyle === "unified" ? "active" : ""}
            onClick={() => onDiffStyleChange("unified")}
            title="Unified"
          >
            Unified
          </button>
        </div>
      )}

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
      <button
        type="button"
        className="icon-button"
        onClick={onRefresh}
        title="Refresh"
      >
        ⟳
      </button>
    </header>
  );
}
