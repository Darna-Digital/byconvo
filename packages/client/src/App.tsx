import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import { BottomPanel } from "./components/BottomPanel";
import { CodeEditor } from "./components/CodeEditor";
import { CodeView } from "./components/CodeView";
import { CommitPanel } from "./components/CommitPanel";
import { DiffPane } from "./components/DiffPane";
import type { DraftLocation } from "./components/DiffPane";
import { ModeRail } from "./components/ModeRail";
import { RepoList } from "./components/RepoList";
import { RepoPicker } from "./components/RepoPicker";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import type { CursorPosition } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import type {
  AppMode,
  BranchInfo,
  BrowseView,
  CommitDetail,
  CommitInfo,
  DiffTarget,
  FilesPayload,
  LogQuery,
  PullRequestInfo,
  RemoteBranchInfo,
  RepoInfo,
  RepoStatus,
  ReviewComment,
  WorkspaceInfo,
} from "./types";
import { diffTargetKey, emptyLogQuery } from "./types";

type Theme = "light" | "dark";
type DiffStyle = "split" | "unified";

const initialTheme = (): Theme => {
  const stored = localStorage.getItem("reviewer-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("split");
  // JetBrains-style connector ribbons in split view; on unless disabled.
  const [connectors, setConnectors] = useState<boolean>(
    () => localStorage.getItem("reviewer-connectors") !== "off",
  );
  const [mode, setMode] = useState<AppMode>("commit");
  // The git bottom panel (branches/log/PRs) is collapsible from the rail.
  const [bottomVisible, setBottomVisible] = useState<boolean>(
    () => localStorage.getItem("reviewer-bottom") !== "off",
  );
  // The bottom panel's height is drag-resizable; persist it across sessions.
  const [bottomHeight, setBottomHeight] = useState<number>(() => {
    const stored = Number(localStorage.getItem("reviewer-bottom-h"));
    return Number.isFinite(stored) && stored >= 120 ? stored : 240;
  });
  // The left sidebar's width is drag-resizable; persist it across sessions.
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem("reviewer-sidebar-w"));
    return Number.isFinite(stored) && stored >= 180 ? stored : 280;
  });
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<FilesPayload | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [branches, setBranches] = useState<ReadonlyArray<BranchInfo>>([]);
  const [remoteBranches, setRemoteBranches] = useState<
    ReadonlyArray<RemoteBranchInfo>
  >([]);
  const [commits, setCommits] = useState<ReadonlyArray<CommitInfo>>([]);
  const [logRef, setLogRef] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState<LogQuery>(emptyLogQuery);
  const [commitDetail, setCommitDetail] = useState<CommitDetail | null>(null);
  const [commitDetailLoading, setCommitDetailLoading] = useState(false);
  const [pulls, setPulls] = useState<ReadonlyArray<PullRequestInfo>>([]);
  const [pullsError, setPullsError] = useState<string | null>(null);
  const [selectedPull, setSelectedPull] = useState<PullRequestInfo | null>(null);
  const [browseView, setBrowseView] = useState<BrowseView | null>(null);
  // The path being edited; when set, an editor overlays the center in any mode.
  const [editing, setEditing] = useState<string | null>(null);
  // The path being previewed read-only (Browse mode); overlays the center.
  const [viewing, setViewing] = useState<string | null>(null);
  // Caret position reported by the editor, shown in the status bar.
  const [cursor, setCursor] = useState<CursorPosition | null>(null);
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
    localStorage.setItem("reviewer-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("reviewer-connectors", connectors ? "on" : "off");
  }, [connectors]);

  useEffect(() => {
    localStorage.setItem("reviewer-bottom", bottomVisible ? "on" : "off");
  }, [bottomVisible]);

  useEffect(() => {
    localStorage.setItem("reviewer-bottom-h", String(Math.round(bottomHeight)));
  }, [bottomHeight]);

  useEffect(() => {
    localStorage.setItem("reviewer-sidebar-w", String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  // A plain folder of repos has no git state of its own — clear it so nothing
  // from a previously open repo lingers behind the repo list.
  const clearRepoState = useCallback(() => {
    setRepo(null);
    setFiles(null);
    setStatus(null);
    setBranches([]);
    setRemoteBranches([]);
    setLocalComments([]);
    setCommits([]);
  }, []);

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
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
    api
      .branches()
      .then(setBranches)
      .catch(() => setBranches([]));
    api
      .remoteBranches()
      .then(setRemoteBranches)
      .catch(() => setRemoteBranches([]));
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
        else if (info.isGitRepo) refreshRepoState();
        else clearRepoState();
      })
      .catch(() => setPickerOpen(true));
  }, [refreshRepoState, clearRepoState]);

  const switchRepo = useCallback(
    (info: WorkspaceInfo) => {
      setWorkspace(info);
      setPickerOpen(false);
      // Reset everything that belonged to the previous repository.
      setMode("commit");
      setEditing(null);
      setViewing(null);
      setSelectedFile(null);
      setSelectedPull(null);
      setBrowseView(null);
      setLogRef(null);
      setPulls([]);
      setPullsError(null);
      setPullComments([]);
      setDraft(null);
      if (info.isGitRepo) refreshRepoState();
      else clearRepoState();
    },
    [refreshRepoState, clearRepoState],
  );

  // Open a repository (or folder) by path, e.g. from the child-repo list.
  const openRepo = useCallback(
    (path: string) => {
      api
        .setWorkspace(path)
        .then(switchRepo)
        .catch((cause: Error) => showNotice("err", cause.message));
    },
    [switchRepo, showNotice],
  );

  // The review mode only exists for GitHub repos.
  useEffect(() => {
    if (mode === "review" && repo !== null && repo.github == null) {
      setMode("commit");
    }
  }, [mode, repo]);

  // Branch log follows the selected branch (defaults to the current one) and
  // the active filters; refreshNonce re-fetches after commits, pushes, pulls.
  useEffect(() => {
    const ref = logRef ?? repo?.currentBranch;
    if (ref === undefined) return;
    api
      .log(ref, logQuery)
      .then(setCommits)
      .catch(() => setCommits([]));
  }, [logRef, logQuery, repo?.currentBranch, refreshNonce]);

  // Load the selected commit's details for the panel on the right.
  useEffect(() => {
    const sha = browseView?.kind === "commit" ? browseView.sha : null;
    if (sha === null) {
      setCommitDetail(null);
      return;
    }
    let cancelled = false;
    setCommitDetailLoading(true);
    api
      .commitDetail(sha)
      .then((detail) => {
        if (!cancelled) setCommitDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setCommitDetail(null);
      })
      .finally(() => {
        if (!cancelled) setCommitDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browseView]);

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
    if (browseView?.kind === "range") {
      return { kind: "range", base: browseView.base, head: browseView.head };
    }
    return null;
  }, [mode, selectedPull, browseView]);

  const targetKey = target === null ? "none" : diffTargetKey(target);
  const isGitWorkspace = workspace?.isGitRepo ?? false;
  const currentRepoPath = isGitWorkspace ? (workspace?.current ?? null) : null;

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

  const replyToComment = useCallback(
    async (comment: ReviewComment, body: string) => {
      if (selectedPull === null || comment.source !== "github") return;
      const commentId = Number(comment.id.replace(/^gh-/, ""));
      if (!Number.isInteger(commentId)) return;
      const created = await api.replyToPullComment(
        selectedPull.number,
        commentId,
        body,
      );
      // Anchor the reply to the parent's line so it lands in the same thread,
      // even when GitHub reports a null position for an outdated diff.
      setPullComments((existing) => [
        ...existing,
        {
          ...created,
          filePath: comment.filePath,
          side: comment.side,
          lineNumber: comment.lineNumber,
        },
      ]);
    },
    [selectedPull],
  );

  const checkoutBranch = useCallback(
    async (branch: string) => {
      setOpBusy(true);
      try {
        await api.checkout(branch);
        refreshRepoState();
        setRefreshNonce((nonce) => nonce + 1);
        setMode("commit");
        showNotice("ok", `Checked out ${branch}`);
      } catch (cause) {
        // Surface the reason — most often "local changes would be overwritten"
        // on a dirty tree — instead of silently staying on the old branch.
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
      } finally {
        setOpBusy(false);
      }
    },
    [refreshRepoState, showNotice],
  );

  const createBranch = useCallback(
    async (name: string, startPoint: string | null) => {
      setOpBusy(true);
      try {
        await api.createBranch(name, startPoint);
        refreshRepoState();
        setMode("commit");
        showNotice("ok", `Created branch ${name}`);
      } catch (cause) {
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
      } finally {
        setOpBusy(false);
      }
    },
    [refreshRepoState, showNotice],
  );

  const refresh = useCallback(() => {
    refreshRepoState();
    setRefreshNonce((nonce) => nonce + 1);
  }, [refreshRepoState]);

  // Run a git branch operation (merge/rebase/fetch/rename/delete), reporting the
  // outcome and resyncing the repo afterwards.
  const runBranchOp = useCallback(
    async (label: string, op: () => Promise<{ output?: string } | unknown>) => {
      setOpBusy(true);
      try {
        const result = (await op()) as { output?: string } | undefined;
        const output =
          result !== undefined &&
          typeof result.output === "string" &&
          result.output.length > 0
            ? result.output
            : label;
        showNotice("ok", output);
        refresh();
      } catch (cause) {
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
      } finally {
        setOpBusy(false);
      }
    },
    [refresh, showNotice],
  );

  // Compare a branch against another ref in a read-only range diff.
  const compareBranch = useCallback((base: string, head: string) => {
    setEditing(null);
    setViewing(null);
    setSelectedFile(null);
    setMode("browse");
    setBrowseView({ kind: "range", base, head });
  }, []);

  // Checkout a branch, then bring it up to date with its upstream.
  const checkoutAndUpdate = useCallback(
    async (branch: string) => {
      setOpBusy(true);
      try {
        await api.checkout(branch);
        const { output } = await api.pull();
        showNotice("ok", output.length > 0 ? output : `Checked out and updated ${branch}`);
        refreshRepoState();
        setRefreshNonce((nonce) => nonce + 1);
        setMode("commit");
      } catch (cause) {
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
      } finally {
        setOpBusy(false);
      }
    },
    [refreshRepoState, showNotice],
  );

  const renameBranch = useCallback(
    (from: string) => {
      const to = window.prompt(`Rename branch "${from}" to:`, from);
      if (to === null || to.trim().length === 0 || to.trim() === from) return;
      void runBranchOp(`Renamed ${from} → ${to.trim()}`, () =>
        api.renameBranch(from, to.trim()),
      );
    },
    [runBranchOp],
  );

  const deleteBranch = useCallback(
    (name: string) => {
      if (!window.confirm(`Delete branch "${name}"? This cannot be undone.`)) return;
      void runBranchOp(`Deleted ${name}`, () => api.deleteBranch(name));
    },
    [runBranchOp],
  );

  // Read the latest height inside the drag handler without re-subscribing it.
  const bottomHeightRef = useRef(bottomHeight);
  bottomHeightRef.current = bottomHeight;

  // Drag the bottom panel's top edge to resize it. Clamp between a usable
  // minimum and most of the viewport so the diff area never disappears.
  const startBottomResize = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomHeightRef.current;
    document.body.classList.add("is-resizing-row");
    const onMove = (move: PointerEvent) => {
      const next = startHeight + (startY - move.clientY);
      const max = Math.max(160, window.innerHeight - 200);
      setBottomHeight(Math.min(Math.max(next, 120), max));
    };
    const onUp = () => {
      document.body.classList.remove("is-resizing-row");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // Read the latest width inside the drag handler without re-subscribing it.
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  // Drag the sidebar's right edge to resize it. Clamp between a usable
  // minimum and most of the viewport so the diff area never disappears.
  const startSidebarResize = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    document.body.classList.add("is-resizing-col");
    const onMove = (move: PointerEvent) => {
      const next = startWidth + (move.clientX - startX);
      const max = Math.max(240, window.innerWidth - 400);
      setSidebarWidth(Math.min(Math.max(next, 180), max));
    };
    const onUp = () => {
      document.body.classList.remove("is-resizing-col");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

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

  // In browse mode a file click opens a read-only preview (with an Edit button);
  // in the diff modes it scrolls the diff to that file (the diff header has its
  // own Edit button).
  const onFileSelect = useCallback(
    (path: string | null) => {
      if (path === null) return;
      if (mode === "browse") setViewing(path);
      else setSelectedFile(path);
    },
    [mode],
  );

  const changeMode = useCallback((next: AppMode) => {
    setEditing(null);
    setViewing(null);
    setMode(next);
  }, []);

  const onSaved = useCallback(() => {
    showNotice("ok", "Saved");
    refresh();
  }, [refresh, showNotice]);

  // Delete a file or folder from the tree. Throws on failure so the tree can
  // resync; the working tree is the source of truth via refresh().
  const deletePath = useCallback(
    async (path: string, isDirectory: boolean) => {
      const ok = window.confirm(
        `Delete ${isDirectory ? "folder" : "file"} "${path}"? This cannot be undone.`,
      );
      if (!ok) return;
      try {
        await api.deletePath(path);
        if (editing === path) setEditing(null);
        if (viewing === path) setViewing(null);
        if (selectedFile === path) setSelectedFile(null);
        showNotice("ok", `Deleted ${path}`);
        refresh();
      } catch (cause) {
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
      }
    },
    [editing, viewing, selectedFile, refresh, showNotice],
  );

  // Rename/move a path on disk. Rethrows so the Sidebar reverts its optimistic
  // tree update when the disk operation fails.
  const renamePath = useCallback(
    async (from: string, to: string) => {
      if (from === to) return;
      try {
        await api.renamePath(from, to);
        if (editing === from) setEditing(to);
        if (viewing === from) setViewing(to);
        if (selectedFile === from) setSelectedFile(to);
        showNotice("ok", `Renamed to ${to}`);
        refresh();
      } catch (cause) {
        showNotice("err", cause instanceof Error ? cause.message : String(cause));
        throw cause;
      }
    },
    [editing, viewing, selectedFile, refresh, showNotice],
  );

  // Hide reviewer's own comment store from the review surface.
  const isInternalPath = (path: string) =>
    path === ".reviewer" || path.startsWith(".reviewer/");

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
    if (editing !== null) return editing;
    if (viewing !== null) return viewing;
    if (workspace !== null && workspace.current !== null && !workspace.isGitRepo) {
      return `${workspace.childRepos.length} repositories`;
    }
    if (mode === "commit") return "Local changes";
    if (mode === "review") {
      return selectedPull === null
        ? "Select a pull request"
        : `#${selectedPull.number} · ${selectedPull.title}`;
    }
    if (browseView?.kind === "commit") {
      return `commit ${browseView.shortSha}`;
    }
    if (browseView?.kind === "range") {
      return `${browseView.base} → ${browseView.head}`;
    }
    return "Select a file or commit";
  }, [editing, viewing, mode, selectedPull, browseView, workspace]);

  const renderCenter = () => {
    // A plain folder of repos has no diff surface — show its child git repos.
    if (workspace !== null && workspace.current !== null && !workspace.isGitRepo) {
      return (
        <RepoList
          folder={workspace.current}
          home={workspace.home}
          repos={workspace.childRepos}
          onOpen={openRepo}
        />
      );
    }
    // The editor overlays the center in every mode; it takes precedence over the
    // read-only preview so the Edit button drops straight into it.
    if (editing !== null) {
      return (
        <CodeEditor
          path={editing}
          theme={theme}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onError={(message) => showNotice("err", message)}
          onCursor={setCursor}
        />
      );
    }
    // Browse mode previews files read-only with the same renderer as the diffs.
    if (viewing !== null) {
      return (
        <CodeView
          path={viewing}
          theme={theme}
          onEdit={setEditing}
          onClose={() => setViewing(null)}
          onError={(message) => showNotice("err", message)}
        />
      );
    }
    if (target === null) {
      const hint =
        mode === "review"
          ? "Pick a pull request from the panel below to review it."
          : "Pick a file from the tree to edit it, or a commit from the log to see its diff.";
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
        connectors={connectors}
        loading={diffLoading}
        error={diffError}
        target={target}
        comments={visibleComments}
        draft={draft}
        selectedFile={selectedFile}
        onDraftOpen={setDraft}
        onDraftCancel={() => setDraft(null)}
        onEditFile={setEditing}
        onCommentSubmit={submitComment}
        onCommentDelete={deleteComment}
        onCommentReply={replyToComment}
      />
    );
  };

  return (
    <div
      className={`app ${bottomVisible ? "" : "app-no-bottom"}`}
      style={
        {
          "--bottom-h": `${bottomHeight}px`,
          "--sidebar-w": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <ModeRail
        mode={mode}
        hasGitHub={repo?.github != null}
        theme={theme}
        bottomVisible={bottomVisible}
        onModeChange={changeMode}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onBottomToggle={() => setBottomVisible((v) => !v)}
      />
      <TopBar
        repo={repo}
        branches={branches}
        remoteBranches={remoteBranches}
        mode={mode}
        prLabel={
          mode === "review" && selectedPull !== null
            ? `#${selectedPull.number}`
            : null
        }
        contextLabel={contextLabel}
        diffStyle={diffStyle}
        showDiffStyleToggle={editing === null && viewing === null && target !== null}
        connectors={connectors}
        showConnectorsToggle={
          editing === null && viewing === null && target !== null && diffStyle === "split"
        }
        opBusy={opBusy}
        onDiffStyleChange={setDiffStyle}
        onConnectorsChange={setConnectors}
        onRepoClick={() => setPickerOpen(true)}
        onCheckout={(ref) => void checkoutBranch(ref)}
        onCheckoutAndUpdate={(ref) => void checkoutAndUpdate(ref)}
        onCreateBranch={(name, startPoint) => void createBranch(name, startPoint)}
        onCompare={compareBranch}
        onMerge={(branch) =>
          void runBranchOp(`Merged ${branch}`, () => api.merge(branch))
        }
        onRebase={(onto) =>
          void runBranchOp(`Rebased onto ${onto}`, () => api.rebase(onto))
        }
        onFetch={() => void runBranchOp("Fetched", () => api.fetch())}
        onRenameBranch={renameBranch}
        onDeleteBranch={deleteBranch}
        onCommitMode={() => changeMode("commit")}
        onReviewMode={() => changeMode("review")}
        onPush={() => void runSync("push")}
        onPull={() => void runSync("pull")}
        onRefresh={refresh}
      />



      
      <Sidebar
        mode={mode}
        paths={treePaths}
        gitStatus={treeGitStatus}
        selectedFile={mode === "browse" ? (viewing ?? editing) : selectedFile}
        onFileSelect={onFileSelect}
        onDeletePath={mode === "review" ? undefined : deletePath}
        onRenamePath={mode === "review" ? undefined : renamePath}
        onError={(message) => showNotice("err", message)}
        onResizeStart={startSidebarResize}
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
      {bottomVisible && (
        <BottomPanel
          mode={mode}
          branches={branches}
          remoteBranches={remoteBranches}
          currentBranch={repo?.currentBranch ?? null}
          commits={commits}
          pulls={pulls}
          pullsError={pullsError}
          logRef={logRef ?? repo?.currentBranch ?? null}
          logQuery={logQuery}
          selectedCommitSha={browseView?.kind === "commit" ? browseView.sha : null}
          selectedPullNumber={selectedPull?.number ?? null}
          commitDetail={commitDetail}
          commitDetailLoading={commitDetailLoading}
          onLogRefChange={setLogRef}
          onLogQueryChange={setLogQuery}
          onBranchCheckout={checkoutBranch}
          onSelectCommit={selectCommit}
          onSelectPull={selectPull}
          onSelectCommitFile={(path) => setSelectedFile(path)}
          onResizeStart={startBottomResize}
        />
      )}
      <StatusBar
        repo={repo}
        status={status}
        busy={opBusy}
        openPath={editing ?? viewing}
        cursor={editing !== null ? cursor : null}
        onRepoClick={() => setPickerOpen(true)}
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
    </div>
  );
}
