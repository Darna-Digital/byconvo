/**
 * AppShell — the single IDE orchestrator. It reads the navigation/selection
 * state from the type-safe TanStack route (mode, commit sha, range, pull, open
 * file) instead of the old `App.tsx`'s ~30 `useState`s, pulls data through
 * TanStack Query, derives the diff/tree via the composable `diff` functions, and
 * runs mutations through the composable `git-actions` / `comments` adapters.
 */
import {
  IconArrowDown,
  IconArrowUp,
  IconCloudDownload,
  IconColumns2,
  IconFolders,
  IconGitBranch,
  IconGitCommit,
  IconGitPullRequest,
  IconLayoutBottombarExpand,
  IconMoon,
  IconRefresh,
  IconRepeat,
} from "@tabler/icons-react"
import { useNavigate, useParams, useRouterState, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { CommandMenu, type Command } from "@/components/CommandMenu"
import { CommitPanel } from "@/components/CommitPanel"
import { RepoList } from "@/components/RepoList"
import { DiffPane, type DraftLocation } from "@/components/diff/DiffPane"
import { CodeEditor, type CursorPosition } from "@/components/editor/CodeEditor"
import { CodeView } from "@/components/editor/CodeView"
import { BottomPanel } from "@/components/layout/BottomPanel"
import { ModeRail } from "@/components/layout/ModeRail"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { StatusBar } from "@/components/layout/StatusBar"
import { TopBar } from "@/components/layout/TopBar"
import { FileSidebar } from "@/components/tree/FileSidebar"
import { useCommentsActions } from "@/features/comments/adapters/comments.hook.adapter"
import { useDiffFunctions } from "@/features/diff/adapters/diff.hook.adapter"
import { useGitActions } from "@/features/git-actions/adapters/git-actions.hook.adapter"
import { fetchClient } from "@/lib/api/client"
import { diffTargetKey, emptyLogQuery, type AppMode, type DiffTarget, type LogQuery } from "@/lib/api/types"
import {
  useBranches,
  useComments,
  useDiffText,
  useFiles,
  useLog,
  usePullComments,
  usePulls,
  useRemoteBranches,
  useRepo,
  useStatus,
  useWorkspace,
} from "@/lib/queries"
import { cycleTheme, setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"

type Search = {
  base?: string
  head?: string
  file?: string
  edit?: boolean
  path?: string
}

export function AppShell() {
  const navigate = useNavigate()
  const prefs = useUiPrefs()
  const diffFns = useDiffFunctions()
  const git = useGitActions()
  const comments = useCommentsActions()

  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const params = useParams({ strict: false }) as { sha?: string; pull?: string }
  const search = useSearch({ strict: false }) as Search

  const mode: AppMode = pathname.startsWith("/review")
    ? "review"
    : pathname.startsWith("/browse")
      ? "browse"
      : "commit"

  // --- queries ---------------------------------------------------------------
  const workspace = useWorkspace()
  const repo = useRepo()
  const files = useFiles()
  const status = useStatus()
  const branches = useBranches()
  const remoteBranches = useRemoteBranches()
  const localComments = useComments()
  const hasGitHub = repo.data?.github != null
  const pulls = usePulls(hasGitHub)
  const [logFilters, setLogFilters] = useState<LogQuery>(emptyLogQuery)
  const log = useLog(repo.data?.currentBranch ?? null, logFilters)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [draft, setDraft] = useState<DraftLocation | null>(null)
  const [cursor, setCursor] = useState<CursorPosition | null>(null)

  // Live panel sizes for smooth dragging; seeded from (and committed back to)
  // the persisted prefs so they survive reloads. See `ResizeHandle`.
  const [sidebarWidth, setSidebarWidth] = useState(prefs.sidebarWidth)
  const [bottomHeight, setBottomHeight] = useState(prefs.bottomHeight)

  const isFolder = workspace.data?.current != null && workspace.data.isGitRepo === false

  // Open the picker automatically only once the workspace has loaded with no
  // repository selected (not during the initial undefined loading state).
  useEffect(() => {
    if (workspace.isSuccess && workspace.data.current === null) setPickerOpen(true)
  }, [workspace.isSuccess, workspace.data?.current])

  // --- selection / diff target ----------------------------------------------
  const selectedPull = useMemo(() => {
    if (params.pull === undefined) return null
    const n = Number(params.pull)
    return (
      pulls.data?.find((p) => p.number === n) ?? {
        number: n,
        title: `#${n}`,
        author: "",
        baseRef: "",
        headRef: "",
        headSha: "",
        url: "",
        updatedAt: "",
      }
    )
  }, [params.pull, pulls.data])

  const browse = useMemo(() => {
    if (params.sha !== undefined) {
      return { kind: "commit" as const, sha: params.sha, shortSha: params.sha.slice(0, 7) }
    }
    if (search.base !== undefined && search.head !== undefined) {
      return { kind: "range" as const, base: search.base, head: search.head }
    }
    return null
  }, [params.sha, search.base, search.head])

  const target: DiffTarget | null = diffFns.deriveTarget({ mode, selectedPull, browse })
  const targetKey = target === null ? "none" : diffTargetKey(target)

  const diff = useDiffText(target)
  const parsedFiles = useMemo(
    () => diffFns.parseFiles(typeof diff.data === "string" ? diff.data : null),
    [diff.data, diffFns],
  )
  const pullComments = usePullComments(target?.kind === "pull" ? target.pull.number : null)

  // Reset the comment draft when the diff target changes.
  useEffect(() => setDraft(null), [targetKey])

  // --- derived tree / comments (memoised: these run over the whole repo) -----
  const gitStatus = files.data?.gitStatus ?? []
  const allPaths = files.data?.paths ?? []
  const treePaths = useMemo(
    () => diffFns.treePaths({ mode, allPaths, gitStatus, parsedFiles }),
    [diffFns, mode, allPaths, gitStatus, parsedFiles],
  )
  const treeGitStatus = useMemo(
    () => diffFns.treeGitStatus({ mode, allPaths, gitStatus, parsedFiles }),
    [diffFns, mode, allPaths, gitStatus, parsedFiles],
  )
  const changedFiles = useMemo(() => diffFns.changedFiles(gitStatus), [diffFns, gitStatus])
  const visibleComments = useMemo(
    () =>
      diffFns.visibleComments({
        targetKind: target?.kind ?? null,
        targetKey,
        localComments: localComments.data ?? [],
        pullComments: pullComments.data ?? [],
      }),
    [diffFns, target?.kind, targetKey, localComments.data, pullComments.data],
  )

  // --- navigation helpers ----------------------------------------------------
  const setSearch = (patch: Partial<Search>) =>
    navigate({ to: ".", search: (prev: Search) => ({ ...prev, ...patch }) })
  const openFile = (path: string, edit: boolean) => setSearch({ file: path, edit: edit || undefined })
  const closeFile = () => setSearch({ file: undefined, edit: undefined })

  const onFileSelect = (path: string | null) => {
    if (path === null) return
    if (mode === "browse") openFile(path, false)
    else setSearch({ path })
  }

  const editing = search.file !== undefined && search.edit === true ? search.file : null
  const viewing = search.file !== undefined && search.edit !== true ? search.file : null

  const contextLabel = useMemo(() => {
    if (editing !== null) return editing
    if (viewing !== null) return viewing
    if (isFolder) return `${workspace.data?.childRepos.length ?? 0} repositories`
    if (mode === "commit") return "Local changes"
    if (mode === "review") return selectedPull === null ? "Select a pull request" : `#${selectedPull.number} · ${selectedPull.title}`
    if (browse?.kind === "commit") return `commit ${browse.shortSha}`
    if (browse?.kind === "range") return `${browse.base} → ${browse.head}`
    return "Select a file or commit"
  }, [editing, viewing, isFolder, workspace.data, mode, selectedPull, browse])

  // --- handlers --------------------------------------------------------------
  const deletePath = async (path: string, isDirectory: boolean) => {
    if (!window.confirm(`Delete ${isDirectory ? "folder" : "file"} "${path}"? This cannot be undone.`)) return
    await fetchClient.DELETE("/api/file", { params: { query: { path } } })
    if (search.file === path) closeFile()
    git.refresh()
  }
  const renamePath = async (from: string, to: string) => {
    const { error } = await fetchClient.POST("/api/file/rename", { body: { from, to } })
    if (error) throw new Error("rename failed")
    git.refresh()
  }

  const submitComment = async (location: DraftLocation, body: string) => {
    await comments.submit({ mode, selectedPull, targetKey }, location, body)
    setDraft(null)
  }
  const deleteComment = async (comment: import("@/lib/api/types").ReviewComment) => {
    await comments.remove(comment)
  }
  const replyComment = async (comment: import("@/lib/api/types").ReviewComment, body: string) => {
    await comments.reply(selectedPull, comment, body)
    void pullComments.refetch()
  }

  // --- command palette -------------------------------------------------------
  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "go-commit",
        label: "Go to Local Changes",
        group: "Navigation",
        icon: IconGitCommit,
        keywords: "commit working tree changes",
        run: () => void navigate({ to: "/commit" }),
      },
    ]
    if (hasGitHub) {
      list.push({
        id: "go-review",
        label: "Go to Pull Requests",
        group: "Navigation",
        icon: IconGitPullRequest,
        keywords: "review pr github",
        run: () => void navigate({ to: "/review" }),
      })
    }
    list.push(
      {
        id: "go-browse",
        label: "Browse the Project",
        group: "Navigation",
        icon: IconFolders,
        keywords: "files history commits explore",
        run: () => void navigate({ to: "/browse" }),
      },
      {
        id: "git-refresh",
        label: "Refresh",
        group: "Git",
        icon: IconRefresh,
        keywords: "reload sync",
        run: () => git.refresh(),
      },
      {
        id: "git-fetch",
        label: "Fetch",
        group: "Git",
        icon: IconCloudDownload,
        keywords: "remote",
        run: () => void git.fetch(),
      },
      {
        id: "git-pull",
        label: "Pull",
        group: "Git",
        icon: IconArrowDown,
        keywords: "remote update",
        run: () => void git.pull(),
      },
      {
        id: "git-push",
        label: "Push",
        group: "Git",
        icon: IconArrowUp,
        keywords: "remote upload",
        run: () => void git.push(),
      },
      {
        id: "git-branch",
        label: "Create Branch…",
        group: "Git",
        icon: IconGitBranch,
        keywords: "new checkout",
        run: () => {
          const name = window.prompt("New branch name:")
          if (name && name.trim()) void git.createBranch(name.trim(), repo.data?.currentBranch ?? null)
        },
      },
      {
        id: "view-theme",
        label: "Toggle Theme",
        group: "View",
        icon: IconMoon,
        keywords: "dark light system appearance",
        hint: prefs.theme,
        run: () => cycleTheme(),
      },
      {
        id: "view-diff-style",
        label: "Toggle Diff Style",
        group: "View",
        icon: IconColumns2,
        keywords: "split unified side by side inline",
        hint: prefs.diffStyle,
        run: () => setUiPrefs({ diffStyle: prefs.diffStyle === "split" ? "unified" : "split" }),
      },
      {
        id: "view-bottom-panel",
        label: prefs.bottomVisible ? "Hide Bottom Panel" : "Show Bottom Panel",
        group: "View",
        icon: IconLayoutBottombarExpand,
        keywords: "branches history pulls toggle",
        run: () => setUiPrefs({ bottomVisible: !prefs.bottomVisible }),
      },
      {
        id: "repo-switch",
        label: "Switch Repository…",
        group: "Repository",
        icon: IconRepeat,
        keywords: "open change project picker",
        run: () => setPickerOpen(true),
      },
    )
    return list
  }, [navigate, git, hasGitHub, prefs.theme, prefs.diffStyle, prefs.bottomVisible, repo.data?.currentBranch])

  // --- center pane -----------------------------------------------------------
  const renderCenter = () => {
    if (isFolder) {
      return (
        <RepoList
          folder={workspace.data!.current!}
          repos={workspace.data!.childRepos}
          onOpen={(path) => void choose(path)}
        />
      )
    }
    if (editing !== null) {
      return <CodeEditor path={editing} theme={prefs.resolvedTheme} onClose={closeFile} onSaved={git.refresh} onCursor={setCursor} />
    }
    if (viewing !== null) {
      return <CodeView path={viewing} theme={prefs.resolvedTheme} onEdit={(p) => openFile(p, true)} onClose={closeFile} />
    }
    if (target === null) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm">
          <div className="font-medium">Nothing open</div>
          <div className="text-muted-foreground">
            {mode === "review"
              ? "Pick a pull request from the panel below to review it."
              : "Pick a file from the tree, or a commit from the log."}
          </div>
        </div>
      )
    }
    return (
      <DiffPane
        files={parsedFiles}
        theme={prefs.resolvedTheme}
        diffStyle={prefs.diffStyle}
        connectors={prefs.connectors}
        loading={diff.isPending}
        error={diff.error ? "Could not load diff" : null}
        target={target}
        comments={visibleComments}
        draft={draft}
        selectedFile={search.path ?? null}
        onDraftOpen={setDraft}
        onDraftCancel={() => setDraft(null)}
        onEditFile={(p) => openFile(p, true)}
        onCommentSubmit={submitComment}
        onCommentDelete={deleteComment}
        onCommentReply={replyComment}
      />
    )
  }

  const choose = async (path: string) => {
    const { error } = await fetchClient.POST("/api/workspace", { body: { path } })
    if (!error) {
      git.refresh()
      void navigate({ to: "/commit" })
    }
  }

  return (
    <div className="flex h-svh w-full overflow-hidden text-foreground">
      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        commands={commands}
        files={allPaths}
        onOpenFile={(path) => openFile(path, false)}
      />
      <ModeRail
        mode={mode}
        hasGitHub={hasGitHub}
        bottomVisible={prefs.bottomVisible}
        onBottomToggle={() => setUiPrefs({ bottomVisible: !prefs.bottomVisible })}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          repo={repo.data ?? null}
          workspace={workspace.data}
          branches={branches.data ?? []}
          remoteBranches={remoteBranches.data ?? []}
          contextLabel={contextLabel}
          diffStyle={prefs.diffStyle}
          themePref={prefs.theme}
          showDiffStyleToggle={editing === null && viewing === null && target !== null}
          busy={false}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
          onThemeChange={(theme) => setUiPrefs({ theme })}
          onDiffStyleChange={(diffStyle) => setUiPrefs({ diffStyle })}
          onCheckout={(b) => {
            void git.checkout(b)
            void navigate({ to: "/commit" })
          }}
          onCheckoutAndUpdate={(b) => {
            void git.checkoutAndUpdate(b)
            void navigate({ to: "/commit" })
          }}
          onCreateBranch={(name, sp) => void git.createBranch(name, sp)}
          onCompare={(base, head) => void navigate({ to: "/browse/range", search: { base, head } })}
          onMerge={(b) => void git.merge(b)}
          onRebase={(o) => void git.rebase(o)}
          onRenameBranch={(from) => {
            const to = window.prompt(`Rename "${from}" to:`, from)
            if (to && to.trim() && to.trim() !== from) void git.renameBranch(from, to.trim())
          }}
          onDeleteBranch={(name) => {
            if (window.confirm(`Delete branch "${name}"?`)) void git.deleteBranch(name)
          }}
          onFetch={() => void git.fetch()}
          onPush={() => void git.push()}
          onPull={() => void git.pull()}
          onRefresh={git.refresh}
        />

        {/* Everything below the title bar sits in a panel whose left border +
            rounded top-left form the rail divider, so it curves in right above
            the file list while the title-bar strip stays clean. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-lg border-l border-t">
        <div className="flex min-h-0 flex-1">
          <div className="shrink-0 overflow-hidden border-r" style={{ width: sidebarWidth }}>
            <FileSidebar
              mode={mode}
              paths={treePaths}
              gitStatus={treeGitStatus}
              selectedFile={mode === "browse" ? (viewing ?? editing) : (search.path ?? null)}
              onFileSelect={onFileSelect}
              onDeletePath={mode === "review" ? undefined : deletePath}
              onRenamePath={mode === "review" ? undefined : renamePath}
              footer={
                mode === "commit" && changedFiles.length > 0 ? (
                  <CommitPanel
                    changes={changedFiles}
                    busy={false}
                    onCommit={(m, p, push) => git.commitChanges(m, p, push)}
                  />
                ) : undefined
              }
            />
          </div>
          <ResizeHandle
            orientation="col"
            value={sidebarWidth}
            min={180}
            max={() => Math.max(240, window.innerWidth - 400)}
            onResize={setSidebarWidth}
            onResizeEnd={(w) => setUiPrefs({ sidebarWidth: w })}
            label="Resize sidebar"
          />
          <main className="min-w-0 flex-1 overflow-hidden">{renderCenter()}</main>
        </div>
        {prefs.bottomVisible && (
          <ResizeHandle
            orientation="row"
            value={bottomHeight}
            min={120}
            max={() => Math.max(160, window.innerHeight - 200)}
            direction={-1}
            onResize={setBottomHeight}
            onResizeEnd={(h) => setUiPrefs({ bottomHeight: h })}
            label="Resize bottom panel"
          />
        )}
        {prefs.bottomVisible && (
          <div className="shrink-0 overflow-hidden border-t" style={{ height: bottomHeight }}>
            <BottomPanel
              defaultTab={mode === "review" ? "pulls" : mode === "browse" ? "history" : "branches"}
              hasGitHub={hasGitHub}
              branches={branches.data ?? []}
              currentBranch={repo.data?.currentBranch ?? null}
              commits={log.data ?? []}
              pulls={pulls.data ?? []}
              pullsError={pulls.error ? "Could not load pull requests" : null}
              logFilters={logFilters}
              selectedCommitSha={browse?.kind === "commit" ? browse.sha : null}
              selectedPullNumber={selectedPull?.number ?? null}
              onLogFiltersChange={setLogFilters}
              onBranchCheckout={(b) => {
                void git.checkout(b)
                void navigate({ to: "/commit" })
              }}
              onCompare={(base, head) => void navigate({ to: "/browse/range", search: { base, head } })}
              onSelectCommit={(c) => void navigate({ to: "/browse/commit/$sha", params: { sha: c.sha } })}
              onSelectPull={(p) => void navigate({ to: "/review/$pull", params: { pull: String(p.number) } })}
            />
          </div>
        )}

        <StatusBar
          repo={repo.data ?? null}
          status={status.data ?? null}
          busy={false}
          openPath={editing ?? viewing}
          cursor={editing !== null ? cursor : null}
          onRepoClick={() => setPickerOpen(true)}
        />
        </div>
      </div>
    </div>
  )
}
