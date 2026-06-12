import { parsePatchFiles } from "@pierre/diffs"
import type { FileDiffMetadata } from "@pierre/diffs"
import { useCallback, useEffect, useMemo, useState } from "react"
import { api } from "./api"
import { BottomPanel } from "./components/BottomPanel"
import { DiffPane } from "./components/DiffPane"
import type { DraftLocation } from "./components/DiffPane"
import { Sidebar } from "./components/Sidebar"
import { TopBar } from "./components/TopBar"
import type {
  BranchInfo,
  CommitInfo,
  DiffTarget,
  FilesPayload,
  PullRequestInfo,
  RepoInfo,
  ReviewComment
} from "./types"
import { diffTargetKey } from "./types"

type Theme = "light" | "dark"

const initialTheme = (): Theme => {
  const stored = localStorage.getItem("codediff-theme")
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [files, setFiles] = useState<FilesPayload | null>(null)
  const [branches, setBranches] = useState<ReadonlyArray<BranchInfo>>([])
  const [commits, setCommits] = useState<ReadonlyArray<CommitInfo>>([])
  const [logRef, setLogRef] = useState<string | null>(null)
  const [pulls, setPulls] = useState<ReadonlyArray<PullRequestInfo>>([])
  const [pullsError, setPullsError] = useState<string | null>(null)
  const [target, setTarget] = useState<DiffTarget>({ kind: "worktree" })
  const [diffText, setDiffText] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(true)
  const [localComments, setLocalComments] = useState<ReadonlyArray<ReviewComment>>([])
  const [pullComments, setPullComments] = useState<ReadonlyArray<ReviewComment>>([])
  const [draft, setDraft] = useState<DraftLocation | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme
    localStorage.setItem("codediff-theme", theme)
  }, [theme])

  const refreshRepoState = useCallback(() => {
    api.repo().then(setRepo).catch(() => setRepo(null))
    api.files().then(setFiles).catch(() => setFiles(null))
    api.branches().then(setBranches).catch(() => setBranches([]))
    api.comments().then(setLocalComments).catch(() => setLocalComments([]))
  }, [])

  useEffect(() => {
    refreshRepoState()
  }, [refreshRepoState])

  // Branch log follows the selected branch (defaults to the current one).
  useEffect(() => {
    const ref = logRef ?? repo?.currentBranch
    if (ref === undefined) return
    api.log(ref).then(setCommits).catch(() => setCommits([]))
  }, [logRef, repo?.currentBranch])

  // Load PRs lazily once the repo is known to live on GitHub.
  useEffect(() => {
    if (repo?.github == null) return
    api.pulls().then((loaded) => {
      setPulls(loaded)
      setPullsError(null)
    }).catch((error: Error) => setPullsError(error.message))
  }, [repo?.github])

  // Fetch the diff whenever the review target changes.
  const targetKey = diffTargetKey(target)
  useEffect(() => {
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    setDraft(null)
    api.diff(target)
      .then((text) => {
        if (cancelled) return
        setDiffText(text)
        setDiffLoading(false)
      })
      .catch((error: Error) => {
        if (cancelled) return
        setDiffError(error.message)
        setDiffText(null)
        setDiffLoading(false)
      })
    if (target.kind === "pull") {
      api.pullComments(target.pull.number).then((loaded) => {
        if (!cancelled) setPullComments(loaded)
      }).catch(() => setPullComments([]))
    } else {
      setPullComments([])
    }
    return () => {
      cancelled = true
    }
    // targetKey identifies the target by value; `target` itself is a fresh object per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  const parsedFiles = useMemo<ReadonlyArray<FileDiffMetadata>>(() => {
    if (diffText === null || diffText.trim().length === 0) return []
    try {
      return parsePatchFiles(diffText).flatMap((patch) => patch.files)
    } catch {
      return []
    }
  }, [diffText])

  const visibleComments = useMemo(() => {
    if (target.kind === "pull") return pullComments
    return localComments.filter((comment) => comment.target === targetKey)
  }, [target.kind, targetKey, localComments, pullComments])

  const submitComment = useCallback(async (location: DraftLocation, body: string) => {
    if (target.kind === "pull") {
      const created = await api.addPullComment(target.pull.number, {
        filePath: location.filePath,
        side: location.side,
        lineNumber: location.lineNumber,
        body
      })
      setPullComments((existing) => [...existing, created])
    } else {
      const created = await api.addComment({
        filePath: location.filePath,
        side: location.side,
        lineNumber: location.lineNumber,
        body,
        target: targetKey
      })
      setLocalComments((existing) => [...existing, created])
    }
    setDraft(null)
  }, [target, targetKey])

  const deleteComment = useCallback(async (comment: ReviewComment) => {
    if (comment.source !== "local") return
    await api.deleteComment(comment.id)
    setLocalComments((existing) => existing.filter((c) => c.id !== comment.id))
  }, [])

  const checkoutBranch = useCallback(async (branch: string) => {
    await api.checkout(branch)
    refreshRepoState()
    setTarget({ kind: "worktree" })
  }, [refreshRepoState])

  const refresh = useCallback(() => {
    refreshRepoState()
    // Re-fetch the diff by re-running the target effect.
    setTarget((current) => ({ ...current }))
  }, [refreshRepoState])

  // The sidebar shows the whole repo for worktree review, and only the
  // changed files when reviewing a range, commit, or PR.
  // Hide codediff's own comment store from the review surface.
  const isInternalPath = (path: string) => path === ".codediff" || path.startsWith(".codediff/")

  const treePaths = useMemo(() => {
    if (target.kind === "worktree") {
      return (files?.paths ?? []).filter((path) => !isInternalPath(path))
    }
    return parsedFiles.map((file) => file.name)
  }, [target.kind, files, parsedFiles])

  const treeGitStatus = useMemo(() => {
    if (target.kind === "worktree") {
      return (files?.gitStatus ?? []).filter((entry) => !isInternalPath(entry.path))
    }
    return parsedFiles.map((file) => ({
      path: file.name,
      status: file.type === "new"
        ? "added" as const
        : file.type === "deleted"
        ? "deleted" as const
        : file.type === "rename-pure" || file.type === "rename-changed"
        ? "renamed" as const
        : "modified" as const
    }))
  }, [target.kind, files, parsedFiles])

  return (
    <div className="app">
      <TopBar
        repo={repo}
        branches={branches}
        target={target}
        theme={theme}
        onTargetChange={setTarget}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onRefresh={refresh}
      />
      <Sidebar
        paths={treePaths}
        gitStatus={treeGitStatus}
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
      />
      <DiffPane
        files={parsedFiles}
        theme={theme}
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
      <BottomPanel
        branches={branches}
        commits={commits}
        pulls={pulls}
        pullsError={pullsError}
        hasGitHub={repo?.github != null}
        logRef={logRef ?? repo?.currentBranch ?? null}
        target={target}
        onLogRefChange={setLogRef}
        onBranchCheckout={checkoutBranch}
        onTargetChange={setTarget}
      />
    </div>
  )
}
