/**
 * ThreadsPage — Zed-style terminal threads. A Threads Sidebar on the left lists
 * every repo-scoped terminal (plain shell or an agent CLI); the panel body on
 * the right shows the one selected thread's live terminal with a toolbar (title
 * + rename, agent, task link, and the New-terminal/agent selector top-right).
 *
 * Like Zed, backgrounded terminals keep running: every visited thread's terminal
 * stays mounted (just hidden) so its PTY session survives switching, and a
 * hidden terminal that emits a bell shows an activity dot in the sidebar.
 */
import {
  IconPencil,
  IconPlus,
  IconRobot,
  IconTerminal2,
  IconX,
} from "@tabler/icons-react"
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
  SelectValue,
} from "@/components/ui/select"
import { Terminal } from "@/components/threads/Terminal"
import { useThreadsActions } from "@/features/threads/adapters/threads.hook.adapter"
import {
  AGENTS,
  agentLabel,
  isAgentThread,
} from "@/features/threads/entity/agents"
import type { AgentKind, ThreadSummary } from "@/lib/api/types"
import { useKanban, useThreads } from "@/lib/queries"
import { useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

const NO_TASK = "__none__"

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
      <DropdownMenuContent align="end">
        {AGENTS.map((agent) => (
          <DropdownMenuItem key={agent.kind} onClick={() => onPick(agent.kind)}>
            <span className="font-medium">{agent.label}</span>
            <span className="ml-auto pl-4 text-xs text-muted-foreground">
              {agent.hint}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThreadsPage() {
  const threads = useThreads()
  const actions = useThreadsActions()
  const kanban = useKanban()
  const prefs = useUiPrefs()

  const summaries = useMemo(() => threads.data ?? [], [threads.data])
  const cards = kanban.data?.cards ?? []

  const [activeId, setActiveId] = useState<string | null>(null)
  // Threads whose terminal has been mounted (and kept alive) — Zed keeps a
  // backgrounded terminal running, so we never unmount a visited one.
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
  const ActiveIcon =
    active !== null && isAgentThread(active.agent) ? IconRobot : IconTerminal2

  const createThread = async (agent: AgentKind) => {
    try {
      const created = await actions.create(agent, "", null)
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

  return (
    <div className="flex h-full min-h-0">
      {/* Threads sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Threads</span>
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
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No terminals yet. Start one from the + menu.
            </p>
          ) : (
            summaries.map((t) => {
              const Icon = isAgentThread(t.agent) ? IconRobot : IconTerminal2
              return (
                <div
                  key={t.id}
                  className={cn(
                    "group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    t.id === activeId && "bg-muted"
                  )}
                  onClick={() => setActiveId(t.id)}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {subtitleOf(t)}
                    </div>
                  </div>
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
            })
          )}
        </div>
      </aside>

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
                <Select
                  value={active.taskKey ?? NO_TASK}
                  onValueChange={(v) =>
                    void linkTask(active.id, active.title, v ?? NO_TASK)
                  }
                >
                  <SelectTrigger size="sm" className="h-7 w-32">
                    <SelectValue placeholder="Link task" />
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
