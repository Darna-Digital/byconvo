import type { AppMode, BranchInfo, RemoteBranchInfo, RepoInfo } from "../types";
import { GitWidget } from "./GitWidget";

interface TopBarProps {
  repo: RepoInfo | null;
  branches: ReadonlyArray<BranchInfo>;
  remoteBranches: ReadonlyArray<RemoteBranchInfo>;
  mode: AppMode;
  prLabel: string | null;
  contextLabel: string;
  diffStyle: "split" | "unified";
  showDiffStyleToggle: boolean;
  connectors: boolean;
  showConnectorsToggle: boolean;
  opBusy: boolean;
  onDiffStyleChange: (style: "split" | "unified") => void;
  onConnectorsChange: (enabled: boolean) => void;
  onRepoClick: () => void;
  onCheckout: (ref: string) => void;
  onCheckoutAndUpdate: (ref: string) => void;
  onCreateBranch: (name: string, startPoint: string | null) => void;
  onCompare: (base: string, head: string) => void;
  onMerge: (branch: string) => void;
  onRebase: (onto: string) => void;
  onFetch: () => void;
  onRenameBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  onCommitMode: () => void;
  onReviewMode: () => void;
  onPush: () => void;
  onPull: () => void;
  onRefresh: () => void;
}

export function TopBar({
  repo,
  branches,
  remoteBranches,
  mode,
  prLabel,
  contextLabel,
  diffStyle,
  showDiffStyleToggle,
  connectors,
  showConnectorsToggle,
  opBusy,
  onDiffStyleChange,
  onConnectorsChange,
  onRepoClick,
  onCheckout,
  onCheckoutAndUpdate,
  onCreateBranch,
  onCompare,
  onMerge,
  onRebase,
  onFetch,
  onRenameBranch,
  onDeleteBranch,
  onCommitMode,
  onReviewMode,
  onPush,
  onPull,
  onRefresh,
}: TopBarProps) {
  const current = branches.find((branch) => branch.isCurrent);

  return (
    <header className="topbar">
      <button
        type="button"
        className="repo-chip"
        onClick={onRepoClick}
        title="Switch repository"
      >
        {repo !== null ? (
          <>
            <span>{repo.name}</span>
          </>
        ) : (
          <span>Open repository…</span>
        )}
      </button>

      {repo !== null && (
        <GitWidget
          repo={repo}
          branches={branches}
          remoteBranches={remoteBranches}
          mode={mode}
          prLabel={prLabel}
          opBusy={opBusy}
          onCheckout={onCheckout}
          onCheckoutAndUpdate={onCheckoutAndUpdate}
          onCreateBranch={onCreateBranch}
          onCompare={onCompare}
          onMerge={onMerge}
          onRebase={onRebase}
          onFetch={onFetch}
          onRenameBranch={onRenameBranch}
          onDeleteBranch={onDeleteBranch}
          onCommitMode={onCommitMode}
          onReviewMode={onReviewMode}
          onPush={onPush}
          onPull={onPull}
        />
      )}

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

      {showConnectorsToggle && (
        <button
          type="button"
          className={`icon-button connectors-toggle${connectors ? " active" : ""}`}
          onClick={() => onConnectorsChange(!connectors)}
          aria-pressed={connectors}
          title={
            connectors ? "Hide change connectors" : "Show change connectors"
          }
        >
          ⤳
        </button>
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
            ↓
            {current !== undefined && current.behind > 0
              ? ` ${current.behind}`
              : ""}
          </button>
          <button
            type="button"
            className="sync-button"
            onClick={onPush}
            disabled={opBusy}
            title="Push"
          >
            ↑
            {current !== undefined && current.ahead > 0
              ? ` ${current.ahead}`
              : ""}
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
