/**
 * ThreadsPage — a collection of live, interactive terminals (Zed-style terminal
 * threads). Each thread is a real PTY rendered with xterm.js: a plain shell, or
 * an agent CLI (Claude Code / opencode / Codex) running interactively in the
 * selected repo. Threads are laid out as a grid of terminals; a thread can be
 * linked to a Kanban card so terminal work references a task.
 */
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import type { AgentKind } from "@/lib/api/types"
import { useKanban, useThreads } from "@/lib/queries"
import { useUiPrefs } from "@/lib/ui-prefs"

const NO_TASK = "__none__"

export function ThreadsPage() {
  const threads = useThreads()
  const actions = useThreadsActions()
  const kanban = useKanban()
  const prefs = useUiPrefs()

  const summaries = useMemo(() => threads.data ?? [], [threads.data])
  const cards = kanban.data?.cards ?? []
  const [busy, setBusy] = useState(false)

  const createThread = async (agent: AgentKind) => {
    setBusy(true)
    try {
      await actions.create(agent, "", null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not create thread"
      )
    } finally {
      setBusy(false)
    }
  }

  const removeThread = async (id: string) => {
    if (!window.confirm("Close this terminal thread?")) return
    await actions.remove(id)
  }

  const linkTask = async (id: string, title: string, key: string) =>
    actions.linkTask(id, title, key === NO_TASK ? null : key)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">Terminals</span>
        <span className="text-xs text-muted-foreground">
          {summaries.length} open · live PTYs in this repo
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={busy}
              />
            }
          >
            <IconPlus className="size-4" /> New terminal
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {AGENTS.map((agent) => (
              <DropdownMenuItem
                key={agent.kind}
                onClick={() => void createThread(agent.kind)}
              >
                <span className="font-medium">{agent.label}</span>
                <span className="ml-auto pl-4 text-xs text-muted-foreground">
                  {agent.hint}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {summaries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm">
          <div className="font-medium">No terminals open</div>
          <div className="text-muted-foreground">
            Open one (terminal, Claude Code, opencode, or Codex) from “New
            terminal”.
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(20rem,1fr)] grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-2">
          {summaries.map((t) => (
            <div
              key={t.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background"
            >
              <div className="flex items-center gap-2 border-b px-3 py-1.5">
                <span className="truncate text-sm font-medium">{t.title}</span>
                {isAgentThread(t.agent) && (
                  <Badge variant="secondary" className="shrink-0">
                    {agentLabel(t.agent)}
                  </Badge>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <Select
                    value={t.taskKey ?? NO_TASK}
                    onValueChange={(v) =>
                      void linkTask(t.id, t.title, v ?? NO_TASK)
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Close terminal"
                    onClick={() => void removeThread(t.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 bg-background p-1">
                <Terminal agent={t.agent} resolvedTheme={prefs.resolvedTheme} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
