/**
 * ThreadsPage — terminal threads. A Threads Sidebar on the left lists
 * every repo-scoped terminal (plain shell or an agent CLI); the panel body on
 * the right shows the one selected thread's live terminal with a toolbar (title
 * + rename, agent, task link, and the New-terminal/agent selector top-right).
 *
 * Backgrounded terminals keep running: every visited thread's terminal
 * stays mounted (just hidden) so its PTY session survives switching, and a
 * hidden terminal that emits a bell shows an activity dot in the sidebar.
 */
import { IconGitBranch, IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { agentIcon } from "@/components/threads/agent-icons"
import { Terminal, disposeLiveTerminal } from "@/components/threads/Terminal"
import { useThreadsActions } from "@/features/threads/adapters/threads.hook.adapter"
import { AGENTS, agentLabel } from "@/features/threads/entity/agents"
import type { AgentKind, ThreadSummary } from "@/lib/api/types"
import { useBranches, useRepo, useTasks, useThreads } from "@/lib/queries"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

const NO_TASK = "__none__"
const ALL_BRANCHES = "__all__"

/** Display label for a thread's branch ("" → unscoped threads). */
const branchLabel = (branch: string) =>
  branch.length > 0 ? branch : "No branch"

function NewTerminalMenu({
  onPick,
  trigger,
}: {
  onPick: (agent: AgentKind) => void
  trigger: React.ReactElement
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="min-w-56">
        {AGENTS.map((agent) => {
          const Icon = agentIcon(agent.kind)
          return (
            <DropdownMenuItem
              key={agent.kind}
              onClick={() => onPick(agent.kind)}
              className="gap-3 whitespace-nowrap"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{agent.label}</span>
              <span className="ml-auto pl-4 text-xs text-muted-foreground">
                {agent.hint}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThreadsPage() {
  const threads = useThreads()
  const actions = useThreadsActions()
  const tasks = useTasks()
  const prefs = useUiPrefs()

  const repo = useRepo()
  const branchesQuery = useBranches()

  const summaries = useMemo(() => threads.data ?? [], [threads.data])
  const cards = tasks.data?.cards ?? []
  const currentBranch = repo.data?.currentBranch ?? ""
  const localBranches = useMemo(
    () => (branchesQuery.data ?? []).map((b) => b.name),
    [branchesQuery.data]
  )

  const [sidebarWidth, setSidebarWidth] = useState(prefs.workspaceSidebarWidth)
  // Branch the sidebar is filtered to (null → follow the current branch).
  const [branchFilter, setBranchFilter] = useState<string | null>(null)
  const activeBranch = branchFilter ?? (currentBranch || ALL_BRANCHES)
  // New threads land in the filtered branch (or the current branch under "All").
  const newThreadBranch =
    activeBranch === ALL_BRANCHES ? currentBranch : activeBranch

  // Branches offered in the filter: current + local + any a thread already uses.
  const filterBranches = useMemo(() => {
    const set = new Set<string>()
    if (currentBranch) set.add(currentBranch)
    localBranches.forEach((b) => set.add(b))
    summaries.forEach((t) => t.branch && set.add(t.branch))
    return [...set].sort((a, b) =>
      a === currentBranch ? -1 : b === currentBranch ? 1 : a.localeCompare(b)
    )
  }, [currentBranch, localBranches, summaries])

  // Threads grouped under their branch, in the same order as the filter.
  const groups = useMemo(() => {
    const present = [...new Set(summaries.map((t) => t.branch))].sort((a, b) =>
      a === currentBranch ? -1 : b === currentBranch ? 1 : a.localeCompare(b)
    )
    const branchesToShow =
      activeBranch === ALL_BRANCHES ? present : [activeBranch]
    return branchesToShow.map((branch) => ({
      branch,
      threads: summaries.filter((t) => t.branch === branch),
    }))
  }, [summaries, activeBranch, currentBranch])

  const [activeId, setActiveId] = useState<string | null>(null)
  // Threads whose terminal has been mounted (and kept alive) — we never
  // unmount a visited terminal so it keeps running in the background.
  const [mountedIds, setMountedIds] = useState<ReadonlyArray<string>>([])
  const [liveTitles, setLiveTitles] = useState<Record<string, string>>({})
  const [activity, setActivity] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<{
    id: string
    draft: string
  } | null>(null)

  // Keep a valid selection as the list loads/changes.
  useEffect(() => {
    if (summaries.length === 0) setActiveId(null)
    else if (!summaries.some((t) => t.id === activeId))
      setActiveId(summaries[0].id)
  }, [summaries, activeId])

  // Mount the focused thread (and keep it mounted) + clear its activity.
  useEffect(() => {
    if (activeId === null) return
    setMountedIds((ids) => (ids.includes(activeId) ? ids : [...ids, activeId]))
    setActivity((a) => (a[activeId] ? { ...a, [activeId]: false } : a))
  }, [activeId])

  const active = summaries.find((t) => t.id === activeId) ?? null
  const ActiveIcon = agentIcon(active?.agent ?? "terminal")

  const createThread = async (agent: AgentKind) => {
    try {
      const created = await actions.create(agent, "", null, newThreadBranch)
      setActiveId(created.id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not create thread"
      )
    }
  }

  const closeThread = async (id: string) => {
    setMountedIds((ids) => ids.filter((m) => m !== id))
    if (activeId === id) {
      const next = summaries.find((t) => t.id !== id)
      setActiveId(next?.id ?? null)
    }
    await actions.remove(id)
    // Tear down the persistent client-side session (the server kills the PTY).
    disposeLiveTerminal(id)
  }

  const commitRename = async () => {
    if (renaming === null) return
    const { id, draft } = renaming
    setRenaming(null)
    if (draft.trim().length > 0) await actions.rename(id, draft)
  }

  const linkTask = (id: string, title: string, key: string) =>
    actions.linkTask(id, title, key === NO_TASK ? null : key)

  // Subtitle for a sidebar row: the live process title, else last command/agent.
  const subtitleOf = (t: ThreadSummary) =>
    liveTitles[t.id] ?? t.lastCommand ?? agentLabel(t.agent)

  const renderRow = (t: ThreadSummary) => {
    const Icon = agentIcon(t.agent)
    return (
      <div
        key={t.id}
        className={cn(
          "group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
          t.id === activeId && "bg-muted"
        )}
        onClick={() => setActiveId(t.id)}
        onDoubleClick={() => setRenaming({ id: t.id, draft: t.title })}
        title="Double-click to rename"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {renaming?.id === t.id ? (
          <Input
            autoFocus
            value={renaming.draft}
            className="h-6 flex-1"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenaming({ id: t.id, draft: e.target.value })}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commitRename()
              } else if (e.key === "Escape") setRenaming(null)
            }}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{t.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {subtitleOf(t)}
            </div>
          </div>
        )}
        {activity[t.id] && t.id !== activeId && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-sky-500"
            aria-label="activity"
          />
        )}
        {t.taskKey !== null && (
          <span className="shrink-0 rounded bg-muted-foreground/15 px-1 text-[10px] text-muted-foreground">
            {t.taskKey}
          </span>
        )}
        <button
          type="button"
          aria-label="Close terminal"
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            void closeThread(t.id)
          }}
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Threads sidebar (drag-resizable) */}
      <aside
        className="flex shrink-0 flex-col border-r"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-1.5 px-2 py-2">
          {/* Branch filter — groups threads by branch, defaulting to the
              current branch. New threads are created in the selected branch. */}
          <Select
            value={activeBranch}
            onValueChange={(v) => setBranchFilter(v)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 min-w-0 flex-1 gap-1.5"
              aria-label="Filter threads by branch"
            >
              <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {activeBranch === ALL_BRANCHES
                  ? "All branches"
                  : branchLabel(activeBranch)}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
              {filterBranches.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NewTerminalMenu
            onPick={(a) => void createThread(a)}
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label="New terminal"
              >
                <IconPlus className="size-4" />
              </Button>
            }
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No terminals yet. Start one from the + menu.
            </p>
          ) : groups.every((g) => g.threads.length === 0) ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No terminals in {branchLabel(activeBranch)} yet. Start one from
              the + menu.
            </p>
          ) : activeBranch === ALL_BRANCHES ? (
            // Grouped under branch headers when viewing all branches.
            groups
              .filter((g) => g.threads.length > 0)
              .map((group) => (
                <div key={group.branch} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <IconGitBranch className="size-3 shrink-0" />
                    <span className="truncate">
                      {branchLabel(group.branch)}
                    </span>
                    <span className="ml-auto tabular-nums">
                      {group.threads.length}
                    </span>
                  </div>
                  {group.threads.map(renderRow)}
                </div>
              ))
          ) : (
            // A single branch is selected — the filter is the header.
            groups[0]?.threads.map(renderRow)
          )}
        </div>
      </aside>
      <ResizeHandle
        orientation="col"
        value={sidebarWidth}
        min={180}
        max={() => Math.max(240, window.innerWidth - 480)}
        onResize={setSidebarWidth}
        onResizeEnd={(w) => setUiPrefs({ workspaceSidebarWidth: w })}
        label="Resize sidebar"
      />

      {/* Panel body — single active terminal */}
      <section className="flex min-w-0 flex-1 flex-col">
        {active === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <div className="font-medium">No terminal open</div>
            <div className="text-muted-foreground">
              Start a terminal, Claude Code, opencode, or Codex thread.
            </div>
            <NewTerminalMenu
              onPick={(a) => void createThread(a)}
              trigger={
                <Button size="sm" variant="outline" className="mt-1">
                  <IconPlus className="size-4" /> New terminal
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-1.5">
              <ActiveIcon className="size-4 shrink-0 text-muted-foreground" />
              {renaming?.id === active.id ? (
                <Input
                  autoFocus
                  value={renaming.draft}
                  className="h-7 max-w-64"
                  onChange={(e) =>
                    setRenaming({ id: active.id, draft: e.target.value })
                  }
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void commitRename()
                    } else if (e.key === "Escape") setRenaming(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="group/title flex min-w-0 items-center gap-1.5"
                  onClick={() =>
                    setRenaming({ id: active.id, draft: active.title })
                  }
                >
                  <span className="truncate text-sm font-medium">
                    {active.title}
                  </span>
                  {liveTitles[active.id] && (
                    <span className="truncate text-xs text-muted-foreground">
                      — {liveTitles[active.id]}
                    </span>
                  )}
                  <IconPencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/title:opacity-100" />
                </button>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {/* Move this thread to another branch group. */}
                <Select
                  value={active.branch}
                  onValueChange={(v) =>
                    void actions.setBranch(active.id, active.title, v ?? "")
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto max-w-44 min-w-24 gap-1.5"
                    aria-label="Thread branch"
                  >
                    <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {branchLabel(active.branch)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {filterBranches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={active.taskKey ?? NO_TASK}
                  onValueChange={(v) =>
                    void linkTask(active.id, active.title, v ?? NO_TASK)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto max-w-52 min-w-28"
                  >
                    {/* Render the label directly: base-ui's SelectValue shows
                        the raw value until the items mount, which surfaced the
                        "__none__" sentinel. */}
                    <span className="truncate">
                      {active.taskKey ?? "Link task"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TASK}>No task</SelectItem>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.key}>
                        {c.key} · {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NewTerminalMenu
                  onPick={(a) => void createThread(a)}
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="New terminal"
                    >
                      <IconPlus className="size-4" />
                    </Button>
                  }
                />
              </div>
            </header>

            {/* Every visited terminal stays mounted; only the active one shows. */}
            <div className="relative min-h-0 flex-1 bg-background">
              {summaries
                .filter((t) => mountedIds.includes(t.id))
                .map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "absolute inset-0 p-1",
                      t.id === activeId ? "block" : "hidden"
                    )}
                  >
                    <Terminal
                      id={t.id}
                      agent={t.agent}
                      active={t.id === activeId}
                      resolvedTheme={prefs.resolvedTheme}
                      onTitle={(title) =>
                        setLiveTitles((m) =>
                          m[t.id] === title ? m : { ...m, [t.id]: title }
                        )
                      }
                      onBell={() =>
                        setActivity((a) =>
                          t.id === activeId ? a : { ...a, [t.id]: true }
                        )
                      }
                    />
                  </div>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
