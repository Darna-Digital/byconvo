import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { BottomPanel } from "./components/BottomPanel";
import { CommitPanel } from "./components/CommitPanel";
import { DiffPane } from "./components/DiffPane";
import type { DraftLocation } from "./components/DiffPane";
import { FileView } from "./components/FileView";
import { ModeRail } from "./components/ModeRail";
import { RepoPicker } from "./components/RepoPicker";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import type {
  AppMode,
  BranchInfo,
  BrowseView,
  CommitInfo,
  DiffTarget,
  FilesPayload,
  PullRequestInfo,
  RepoInfo,
  ReviewComment,
  WorkspaceInfo,
} from "./types";
import { diffTargetKey } from "./types";
import { Agentation } from "agentation";

type Theme = "light" | "dark";
type DiffStyle = "split" | "unified";

const initialTheme = (): Theme => {
  const stored = localStorage.getItem("codediff-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("split");
  const [mode, setMode] = useState<AppMode>("commit");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<FilesPayload | null>(null);
  const [branches, setBranches] = useState<ReadonlyArray<BranchInfo>>([]);
  const [commits, setCommits] = useState<ReadonlyArray<CommitInfo>>([]);
  const [logRef, setLogRef] = useState<string | null>(null);
  const [pulls, setPulls] = useState<ReadonlyArray<PullRequestInfo>>([]);
  const [pullsError, setPullsError] = useState<string | null>(null);
  const [selectedPull, setSelectedPull] = useState<PullRequestInfo | null>(null);
  const [browseView, setBrowseView] = useState<BrowseView | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [localComments, setLocalComments] = useState<
    ReadonlyArray<ReviewComment>
  >([]);
  const [pullComments, setPullComments] = useState<
    ReadonlyArray<ReviewComment>
  >([]);
  const [draft, setDraft] = useState<DraftLocation | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [opBusy, setOpBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((kind: "ok" | "err", text: string) => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    setNotice({ kind, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    localStorage.setItem("codediff-theme", theme);
  }, [theme]);

  const refreshRepoState = useCallback(() => {
    api
      .repo()
      .then(setRepo)
      .catch(() => setRepo(null));
    api
      .files()
      .then(setFiles)
      .catch(() => setFiles(null));
    api
      .branches()
      .then(setBranches)
      .catch(() => setBranches([]));
    api
      .comments()
      .then(setLocalComments)
      .catch(() => setLocalComments([]));
  }, []);

  // Find out which repository (if any) is selected before loading anything.
  useEffect(() => {
    api
      .workspace()
      .then((info) => {
        setWorkspace(info);
        if (info.current === null) setPickerOpen(true);
        else refreshRepoState();
      })
      .catch(() => setPickerOpen(true));
  }, [refreshRepoState]);

  const switchRepo = useCallback(
    (info: WorkspaceInfo) => {
      setWorkspace(info);
      setPickerOpen(false);
      // Reset everything that belonged to the previous repository.
      setMode("commit");
      setSelectedFile(null);
      setSelectedPull(null);
      setBrowseView(null);
      setLogRef(null);
      setCommits([]);
      setPulls([]);
      setPullsError(null);
      setPullComments([]);
      setDraft(null);
      refreshRepoState();
    },
    [refreshRepoState],
  );

  // The review mode only exists for GitHub repos.
  useEffect(() => {
    if (mode === "review" && repo !== null && repo.github == null) {
      setMode("commit");
    }
  }, [mode, repo]);

  // Branch log follows the selected branch (defaults to the current one);
  // refreshNonce re-fetches it after commits, pushes, and pulls.
  useEffect(() => {
    const ref = logRef ?? repo?.currentBranch;
    if (ref === undefined) return;
    api
      .log(ref)
      .then(setCommits)
      .catch(() => setCommits([]));
  }, [logRef, repo?.currentBranch, refreshNonce]);

  // Load PRs lazily once the repo is known to live on GitHub.
  useEffect(() => {
    if (repo?.github == null) return;
    api
      .pulls()
      .then((loaded) => {
        setPulls(loaded);
        setPullsError(null);
      })
      .catch((error: Error) => setPullsError(error.message));
  }, [repo?.github]);

  // The diff target is fully derived from the current mode and selection.
  const target = useMemo<DiffTarget | null>(() => {
    if (mode === "commit") return { kind: "worktree" };
    if (mode === "review") {
      return selectedPull === null ? null : { kind: "pull", pull: selectedPull };
    }
    if (browseView?.kind === "commit") {
      return { kind: "commit", sha: browseView.sha, shortSha: browseView.shortSha };
    }
    return null;
  }, [mode, selectedPull, browseView]);

  const targetKey = target === null ? "none" : diffTargetKey(target);
  const currentRepoPath = workspace?.current ?? null;

  // Fetch the diff whenever the derived target changes.
  useEffect(() => {
    if (currentRepoPath === null || target === null) {
      setDiffText(null);
      setDiffError(null);
      setDiffLoading(false);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    setDraft(null);
    api
      .diff(target)
      .then((text) => {
        if (cancelled) return;
        setDiffText(text);
        setDiffLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setDiffError(error.message);
        setDiffText(null);
        setDiffLoading(false);
      });
    if (target.kind === "pull") {
      api
        .pullComments(target.pull.number)
        .then((loaded) => {
          if (!cancelled) setPullComments(loaded);
        })
        .catch(() => setPullComments([]));
    } else {
      setPullComments([]);
    }
    return () => {
      cancelled = true;
    };
    // targetKey identifies the target by value; refreshNonce forces a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, currentRepoPath, refreshNonce]);

  const parsedFiles = useMemo<ReadonlyArray<FileDiffMetadata>>(() => {
    if (diffText === null || diffText.trim().length === 0) return [];
    try {
      return parsePatchFiles(diffText).flatMap((patch) => patch.files);
    } catch {
      return [];
    }
  }, [diffText]);

  const visibleComments = useMemo(() => {
    if (target?.kind === "pull") return pullComments;
    return localComments.filter((comment) => comment.target === targetKey);
  }, [target?.kind, targetKey, localComments, pullComments]);

  const submitComment = useCallback(
    async (location: DraftLocation, body: string) => {
      if (mode === "review" && selectedPull !== null) {
        const created = await api.addPullComment(selectedPull.number, {
          filePath: location.filePath,
          side: location.side,
          lineNumber: location.lineNumber,
          body,
        });
        setPullComments((existing) => [...existing, created]);
        setDraft(null);
        return;
      }
      const created = await api.addComment({
        filePath: location.filePath,
        side: location.side,
        lineNumber: location.lineNumber,
        body,
        target: targetKey,
      });
      setLocalComments((existing) => [...existing, created]);
      setDraft(null);
    },
    [mode, selectedPull, targetKey],
  );

  const deleteComment = useCallback(async (comment: ReviewComment) => {
    if (comment.source !== "local") return;
    await api.deleteComment(comment.id);
    setLocalComments((existing) => existing.filter((c) => c.id !== comment.id));
  }, []);

  const checkoutBranch = useCallback(
    async (branch: string) => {
      await api.checkout(branch);
      refreshRepoState();
      setMode("commit");
    },
    [refreshRepoState],
  );

  const refresh = useCallback(() => {
    refreshRepoState();
    setRefreshNonce((nonce) => nonce + 1);
  }, [refreshRepoState]);

  const commitChanges = useCallback(
    async (message: string, paths: ReadonlyArray<string>, andPush: boolean) => {
      setOpBusy(true);
      try {
        const { sha } = await api.commit(message, paths);
        try {
          if (andPush) {
            await api.push();
            showNotice("ok", `Committed ${sha} and pushed`);
          } else {
            showNotice("ok", `Committed ${sha}`);
          }
        } catch (pushCause) {
          // The commit itself landed — say so alongside the push failure.
          showNotice(
            "err",
            `Committed ${sha}, but push failed:\n${
              pushCause instanceof Error ? pushCause.message : String(pushCause)
            }`,
          );
        }
        refresh();
      } catch (cause) {
        showNotice(
          "err",
          cause instanceof Error ? cause.message : String(cause),
        );
        throw cause;
      } finally {
        setOpBusy(false);
      }
    },
    [refresh, showNotice],
  );

  const runSync = useCallback(
    async (action: "push" | "pull") => {
      setOpBusy(true);
      try {
        const { output } = action === "push" ? await api.push() : await api.pull();
        const fallback = action === "push" ? "Pushed" : "Pulled";
        showNotice("ok", output.length > 0 ? output : fallback);
        refresh();
      } catch (cause) {
        showNotice(
          "err",
          cause instanceof Error ? cause.message : String(cause),
        );
      } finally {
        setOpBusy(false);
      }
    },
    [refresh, showNotice],
  );

  const selectCommit = useCallback((commit: CommitInfo) => {
    setMode("browse");
    setBrowseView({ kind: "commit", sha: commit.sha, shortSha: commit.shortSha });
  }, []);

  const selectPull = useCallback((pull: PullRequestInfo) => {
    setMode("review");
    setSelectedPull(pull);
  }, []);

  const onFileSelect = useCallback(
    (path: string | null) => {
      if (path === null) return;
      if (mode === "browse") setBrowseView({ kind: "file", path });
      else setSelectedFile(path);
    },
    [mode],
  );

  // Hide codediff's own comment store from the review surface.
  const isInternalPath = (path: string) =>
    path === ".codediff" || path.startsWith(".codediff/");

  // The sidebar shows changed files in commit/review, and the whole repo
  // in browse mode so any file can be opened.
  const treePaths = useMemo(() => {
    if (mode === "browse") {
      return (files?.paths ?? []).filter((path) => !isInternalPath(path));
    }
    if (mode === "commit") {
      return (files?.paths ?? [])
        .filter((path) => !isInternalPath(path))
        .filter((path) =>
          (files?.gitStatus ?? []).some((entry) => entry.path === path),
        );
    }
    return parsedFiles.map((file) => file.name);
  }, [mode, files, parsedFiles]);

  const treeGitStatus = useMemo(() => {
    if (mode === "review") {
      return parsedFiles.map((file) => ({
        path: file.name,
        status:
          file.type === "new"
            ? ("added" as const)
            : file.type === "deleted"
              ? ("deleted" as const)
              : file.type === "rename-pure" || file.type === "rename-changed"
                ? ("renamed" as const)
                : ("modified" as const),
      }));
    }
    return (files?.gitStatus ?? []).filter(
      (entry) => !isInternalPath(entry.path),
    );
  }, [mode, files, parsedFiles]);

  const changedFiles = useMemo(
    () => (files?.gitStatus ?? []).filter((entry) => !isInternalPath(entry.path)),
    [files],
  );

  const contextLabel = useMemo(() => {
    if (mode === "commit") return "Local changes";
    if (mode === "review") {
      return selectedPull === null
        ? "Select a pull request"
        : `#${selectedPull.number} · ${selectedPull.title}`;
    }
    if (browseView?.kind === "file") return browseView.path;
    if (browseView?.kind === "commit") {
      return `commit ${browseView.shortSha}`;
    }
    return "Select a file or commit";
  }, [mode, selectedPull, browseView]);

  const renderCenter = () => {
    if (mode === "browse" && browseView?.kind === "file") {
      return <FileView path={browseView.path} theme={theme} />;
    }
    if (target === null) {
      const hint =
        mode === "review"
          ? "Pick a pull request from the panel below to review it."
          : "Pick a file from the tree to read it, or a commit from the log to see its diff.";
      return (
        <main className="diff-pane">
          <div className="diff-empty">
            <div>
              <div>Nothing open</div>
              <div className="hint">{hint}</div>
            </div>
          </div>
        </main>
      );
    }
    return (
      <DiffPane
        files={parsedFiles}
        theme={theme}
        diffStyle={diffStyle}
        loading={diffLoading}
        error={diffError}
        target={target}
        comments={visibleComments}
        draft={draft}
        selectedFile={selectedFile}
        onDraftOpen={setDraft}
        onDraftCancel={() => setDraft(null)}
        onCommentSubmit={submitComment}
        onCommentDelete={deleteComment}
      />
    );
  };

  return (
    <div className="app">
      <ModeRail
        mode={mode}
        hasGitHub={repo?.github != null}
        theme={theme}
        onModeChange={setMode}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <TopBar
        repo={repo}
        branches={branches}
        contextLabel={contextLabel}
        diffStyle={diffStyle}
        showDiffStyleToggle={
          !(mode === "browse" && browseView?.kind === "file") && target !== null
        }
        opBusy={opBusy}
        onDiffStyleChange={setDiffStyle}
        onRepoClick={() => setPickerOpen(true)}
        onPush={() => void runSync("push")}
        onPull={() => void runSync("pull")}
        onRefresh={refresh}
      />
      <Sidebar
        mode={mode}
        paths={treePaths}
        gitStatus={treeGitStatus}
        selectedFile={mode === "browse" ? browseView?.kind === "file" ? browseView.path : null : selectedFile}
        onFileSelect={onFileSelect}
        footer={
          mode === "commit" && changedFiles.length > 0 ? (
            <CommitPanel
              changes={changedFiles}
              busy={opBusy}
              onCommit={commitChanges}
            />
          ) : undefined
        }
      />
      {renderCenter()}
      <BottomPanel
        mode={mode}
        branches={branches}
        commits={commits}
        pulls={pulls}
        pullsError={pullsError}
        logRef={logRef ?? repo?.currentBranch ?? null}
        selectedCommitSha={browseView?.kind === "commit" ? browseView.sha : null}
        selectedPullNumber={selectedPull?.number ?? null}
        onLogRefChange={setLogRef}
        onBranchCheckout={checkoutBranch}
        onSelectCommit={selectCommit}
        onSelectPull={selectPull}
      />
      {pickerOpen && workspace !== null && (
        <RepoPicker
          workspace={workspace}
          dismissable={workspace.current !== null}
          onClose={() => setPickerOpen(false)}
          onSelected={switchRepo}
        />
      )}
      {notice !== null && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}

      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}
