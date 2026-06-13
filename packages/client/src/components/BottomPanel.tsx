import { type PointerEvent as ReactPointerEvent, useMemo } from "react";
import type {
  AppMode,
  BranchInfo,
  CommitDetail,
  CommitInfo,
  LogQuery,
  PullRequestInfo,
  RemoteBranchInfo,
} from "../types";
import { BranchTree } from "./BranchTree";
import { CommitDetails } from "./CommitDetails";
import { buildCommitGraph, GraphCell, GRAPH_ROW_H } from "./CommitGraph";
import { LogFilters } from "./LogFilters";

interface BottomPanelProps {
  mode: AppMode;
  branches: ReadonlyArray<BranchInfo>;
  remoteBranches: ReadonlyArray<RemoteBranchInfo>;
  currentBranch: string | null;
  commits: ReadonlyArray<CommitInfo>;
  pulls: ReadonlyArray<PullRequestInfo>;
  pullsError: string | null;
  logRef: string | null;
  logQuery: LogQuery;
  selectedCommitSha: string | null;
  selectedPullNumber: number | null;
  commitDetail: CommitDetail | null;
  commitDetailLoading: boolean;
  onLogRefChange: (ref: string) => void;
  onLogQueryChange: (query: LogQuery) => void;
  onBranchCheckout: (branch: string) => Promise<void> | void;
  onSelectCommit: (commit: CommitInfo) => void;
  onSelectPull: (pull: PullRequestInfo) => void;
  onSelectCommitFile: (path: string) => void;
  /** Begin a drag on the panel's top edge to resize its height. */
  onResizeStart: (event: ReactPointerEvent) => void;
}

const formatDate = (iso: string): string => {
  if (iso.length === 0) return "";
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function BottomPanel({
  mode,
  branches,
  remoteBranches,
  currentBranch,
  commits,
  pulls,
  pullsError,
  logRef,
  logQuery,
  selectedCommitSha,
  selectedPullNumber,
  commitDetail,
  commitDetailLoading,
  onLogRefChange,
  onLogQueryChange,
  onBranchCheckout,
  onSelectCommit,
  onSelectPull,
  onSelectCommitFile,
  onResizeStart,
}: BottomPanelProps) {
  const showPulls = mode === "review";
  const showDetails = !showPulls && selectedCommitSha !== null;

  const graph = useMemo(() => buildCommitGraph(commits), [commits]);

  return (
    <footer className={`bottom-panel ${showDetails ? "with-details" : ""}`}>
      <div
        className="bottom-resize-handle"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        title="Drag to resize"
      />

      <div className="branches-pane">
        <div className="panel-title">
          <span>Branches</span>
        </div>
        <BranchTree
          branches={branches}
          remoteBranches={remoteBranches}
          currentBranch={currentBranch}
          selectedRef={logRef}
          onSelect={onLogRefChange}
          onCheckout={(ref) => void onBranchCheckout(ref)}
        />
      </div>

      <div className="commits-pane">
        {showPulls ? (
          <>
            <div className="panel-title">
              <span>Pull Requests{pulls.length > 0 ? ` (${pulls.length})` : ""}</span>
            </div>
            <div className="commit-list">
              {pullsError !== null && <div className="empty-note">{pullsError}</div>}
              {pulls.map((pull) => (
                <button
                  key={pull.number}
                  type="button"
                  className={`pull-row ${selectedPullNumber === pull.number ? "selected" : ""}`}
                  onClick={() => onSelectPull(pull)}
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
          </>
        ) : (
          <>
            <LogFilters
              refName={logRef ?? "HEAD"}
              branches={branches}
              query={logQuery}
              onRefChange={onLogRefChange}
              onQueryChange={onLogQueryChange}
            />
            <div className="commit-list graph-list">
              {commits.map((commit, index) => {
                const row = graph.rows[index];
                return (
                  <button
                    key={commit.sha}
                    type="button"
                    className={`commit-row ${commit.parents.length > 1 ? "merge" : ""} ${
                      selectedCommitSha === commit.sha ? "selected" : ""
                    }`}
                    style={{ height: GRAPH_ROW_H }}
                    title="Click to inspect this commit"
                    onClick={() => onSelectCommit(commit)}
                  >
                    {row !== undefined && <GraphCell row={row} width={graph.width} />}
                    {commit.refs.length > 0 && (
                      <span className="refs">
                        {commit.refs.slice(0, 3).map((ref) => (
                          <span key={ref} className="ref-badge">
                            {ref}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="subject">{commit.subject}</span>
                    <span className="author">{commit.author}</span>
                    <span className="date">{formatDate(commit.authoredAt)}</span>
                  </button>
                );
              })}
              {commits.length === 0 && (
                <div className="empty-note">No commits match the current filters.</div>
              )}
            </div>
          </>
        )}
      </div>

      {showDetails && (
        <div className="details-pane">
          <div className="panel-title">
            <span>Commit</span>
          </div>
          <CommitDetails
            detail={commitDetail}
            loading={commitDetailLoading}
            onSelectFile={onSelectCommitFile}
          />
        </div>
      )}
    </footer>
  );
}
