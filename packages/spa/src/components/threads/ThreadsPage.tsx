/**
 * ThreadsPage — Zed-style terminal threads. The left rail lists repo-scoped
 * threads; the main pane shows the selected thread's run history and a prompt to
 * run another command in the repository. A thread can be linked to a Kanban
 * card so terminal work references a task.
 */
import { IconPlus, IconTrash, IconCornerDownLeft } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useThreadsActions } from "@/features/threads/adapters/threads.hook.adapter"
import { useKanban, useThread, useThreads } from "@/lib/queries"
import { timeAgo } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

const NO_TASK = "__none__"

export function ThreadsPage() {
  const threads = useThreads()
  const actions = useThreadsActions()
  const kanban = useKanban()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [command, setCommand] = useState("")
  const [running, setRunning] = useState(false)

  const summaries = useMemo(() => threads.data ?? [], [threads.data])
  // Keep a valid selection as the list loads/changes.
  useEffect(() => {
    if (summaries.length === 0) {
      setSelectedId(null)
    } else if (!summaries.some((t) => t.id === selectedId)) {
      setSelectedId(summaries[0].id)
    }
  }, [summaries, selectedId])

  const detail = useThread(selectedId)
  const thread = detail.data ?? null
  const cards = kanban.data?.cards ?? []

  const createThread = async () => {
    try {
      const created = await actions.create("", null)
      setSelectedId(created.id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not create thread"
      )
    }
  }

  const run = async () => {
    if (thread === null || running) return
    setRunning(true)
    try {
      const entry = await actions.run(thread.id, command)
      if (entry !== null) setCommand("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "command failed")
    } finally {
      setRunning(false)
    }
  }

  const linkTask = async (key: string) => {
    if (thread === null) return
    await actions.linkTask(
      thread.id,
      thread.title,
      key === NO_TASK ? null : key
    )
  }

  const removeThread = async (id: string) => {
    if (!window.confirm("Delete this thread and its history?")) return
    await actions.remove(id)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Threads</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="New thread"
            onClick={createThread}
          >
            <IconPlus className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No threads yet. Start one to run terminal commands in this repo.
            </p>
          ) : (
            summaries.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  t.id === selectedId && "bg-muted"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{t.title}</span>
                  {t.taskKey !== null && (
                    <Badge variant="outline" className="shrink-0">
                      {t.taskKey}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t.lastCommand ?? "no runs yet"} · {timeAgo(t.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {thread === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select or create a thread.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-4 py-2">
              <span className="truncate text-sm font-medium">
                {thread.title}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={thread.taskKey ?? NO_TASK}
                  onValueChange={(v) => void linkTask(v ?? NO_TASK)}
                >
                  <SelectTrigger size="sm" className="w-40">
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
                  aria-label="Delete thread"
                  onClick={() => void removeThread(thread.id)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs">
              {thread.entries.length === 0 ? (
                <p className="text-muted-foreground">
                  Run a command below to start this thread.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {thread.entries.map((entry) => (
                    <div key={entry.id}>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-foreground">
                          $ {entry.command}
                        </span>
                        <span
                          className={cn(
                            entry.exitCode === 0
                              ? "text-muted-foreground"
                              : "text-destructive"
                          )}
                        >
                          exit {entry.exitCode}
                        </span>
                      </div>
                      {entry.stdout.length > 0 && (
                        <pre className="mt-1 break-words whitespace-pre-wrap">
                          {entry.stdout}
                        </pre>
                      )}
                      {entry.stderr.length > 0 && (
                        <pre className="mt-1 break-words whitespace-pre-wrap text-destructive">
                          {entry.stderr}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t p-3">
              <span className="font-mono text-sm text-muted-foreground">$</span>
              <Input
                value={command}
                placeholder={
                  running ? "Running…" : "Run a command in this repo…"
                }
                disabled={running}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void run()
                  }
                }}
                className="font-mono"
              />
              <Button
                size="sm"
                disabled={running || command.trim().length === 0}
                onClick={() => void run()}
              >
                <IconCornerDownLeft className="size-4" /> Run
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
