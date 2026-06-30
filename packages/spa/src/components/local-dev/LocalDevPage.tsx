/**
 * LocalDevPage — JetBrains-style run configurations for the selected repository.
 * The left sidebar lists saved dev commands (e.g. `pnpm dev`) with their live
 * status and per-row run/stop; the body shows the selected command's terminal.
 * Commands can be started/stopped individually or all at once, and the processes
 * keep running on the server while you browse other pages (they stop only when
 * you switch repositories). Definitions are CRUD-managed via a small dialog.
 */
import {
  IconPencil,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { DevTerminal } from "@/components/local-dev/DevTerminal"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLocalDevActions } from "@/features/local-dev/adapters/local-dev.hook.adapter"
import type { DevCommandView } from "@/lib/api/types"
import { useDevCommands } from "@/lib/queries"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

interface Draft {
  id: string | null
  name: string
  command: string
}

const statusLabel = (c: DevCommandView): string => {
  if (c.status === "running") return "running"
  if (c.status === "exited")
    return c.exitCode !== null && c.exitCode !== 0
      ? `exited (${c.exitCode})`
      : "exited"
  return "stopped"
}

function StatusDot({ command }: { command: DevCommandView }) {
  const cls =
    command.status === "running"
      ? "bg-emerald-500"
      : command.status === "exited"
        ? command.exitCode !== null && command.exitCode !== 0
          ? "bg-red-500"
          : "bg-muted-foreground/50"
        : "border border-muted-foreground/40"
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", cls)}
      aria-label={statusLabel(command)}
    />
  )
}

export function LocalDevPage() {
  const commands = useDevCommands()
  const actions = useLocalDevActions()
  const prefs = useUiPrefs()

  const items = useMemo(() => commands.data ?? [], [commands.data])

  const [sidebarWidth, setSidebarWidth] = useState(prefs.workspaceSidebarWidth)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  // Keep a valid selection as the list loads/changes.
  useEffect(() => {
    if (items.length === 0) setActiveId(null)
    else if (!items.some((c) => c.id === activeId)) setActiveId(items[0].id)
  }, [items, activeId])

  const active = items.find((c) => c.id === activeId) ?? null

  const guard = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback)
    }
  }

  const run = (id: string) => {
    setActiveId(id)
    void guard(() => actions.start(id), "could not start command")
  }
  const stop = (id: string) =>
    void guard(() => actions.stop(id), "could not stop command")
  const runAll = () =>
    void guard(async () => {
      await actions.startAll()
      if (items.length > 0) setActiveId(items[0].id)
    }, "could not start commands")
  const stopAll = () =>
    void guard(() => actions.stopAll(), "could not stop commands")

  const removeCommand = (id: string) =>
    void guard(async () => {
      if (activeId === id) {
        const next = items.find((c) => c.id !== id)
        setActiveId(next?.id ?? null)
      }
      await actions.remove(id)
    }, "could not delete command")

  const saveDraft = () =>
    void guard(async () => {
      if (draft === null) return
      const result =
        draft.id === null
          ? await actions.create(draft.name, draft.command)
          : await actions.update(draft.id, draft.name, draft.command)
      if (result === null) {
        toast.error("Enter a command to run")
        return
      }
      if (draft.id === null) setActiveId(result.id)
      setDraft(null)
    }, "could not save command")

  return (
    <div className="flex h-full min-h-0">
      {/* Command list (drag-resizable) */}
      <aside
        className="flex shrink-0 flex-col border-r"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between gap-1 px-3 py-2">
          <span className="text-sm font-medium">Local dev</span>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Run all"
              title="Run all"
              disabled={items.length === 0}
              onClick={runAll}
            >
              <IconPlayerPlayFilled className="size-4 text-emerald-600" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Stop all"
              title="Stop all"
              disabled={items.length === 0}
              onClick={stopAll}
            >
              <IconPlayerStopFilled className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="New command"
              title="New command"
              onClick={() => setDraft({ id: null, name: "", command: "" })}
            >
              <IconPlus className="size-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No dev commands yet. Add one with the + button.
            </p>
          ) : (
            items.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                  c.id === activeId && "bg-muted"
                )}
                onClick={() => setActiveId(c.id)}
                onDoubleClick={() =>
                  setDraft({ id: c.id, name: c.name, command: c.command })
                }
                title="Double-click to edit"
              >
                <StatusDot command={c} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {c.command}
                  </div>
                </div>
                {c.status === "running" ? (
                  <button
                    type="button"
                    aria-label="Stop"
                    title="Stop"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      stop(c.id)
                    }}
                  >
                    <IconPlayerStopFilled className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Run"
                    title="Run"
                    className="shrink-0 text-emerald-600 hover:text-emerald-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      run(c.id)
                    }}
                  >
                    <IconPlayerPlayFilled className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Edit"
                  title="Edit"
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDraft({ id: c.id, name: c.name, command: c.command })
                  }}
                >
                  <IconPencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  title="Delete"
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeCommand(c.id)
                  }}
                >
                  <IconTrash className="size-3.5" />
                </button>
              </div>
            ))
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

      {/* Panel body — the selected command's terminal */}
      <section className="flex min-w-0 flex-1 flex-col">
        {active === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <div className="font-medium">No dev command selected</div>
            <div className="text-muted-foreground">
              Add a command (e.g. <span className="font-mono">pnpm dev</span>)
              and run it from the selected repo.
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => setDraft({ id: null, name: "", command: "" })}
            >
              <IconPlus className="size-4" /> New command
            </Button>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-1.5">
              <StatusDot command={active} />
              <span className="truncate text-sm font-medium">
                {active.name}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {active.command}
              </span>
              <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                · {statusLabel(active)}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {active.status === "running" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => stop(active.id)}
                  >
                    <IconPlayerStopFilled className="size-4" /> Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-emerald-600 hover:text-emerald-600"
                    onClick={() => run(active.id)}
                  >
                    <IconPlayerPlayFilled className="size-4" /> Run
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Edit command"
                  onClick={() =>
                    setDraft({
                      id: active.id,
                      name: active.name,
                      command: active.command,
                    })
                  }
                >
                  <IconPencil className="size-4" />
                </Button>
              </div>
            </header>

            <div className="relative min-h-0 flex-1 bg-background p-1">
              {active.status === "stopped" ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
                  <div className="text-muted-foreground">Not running</div>
                  <Button
                    size="sm"
                    className="text-emerald-50"
                    onClick={() => run(active.id)}
                  >
                    <IconPlayerPlayFilled className="size-4" /> Run
                  </Button>
                </div>
              ) : (
                <DevTerminal
                  key={active.id}
                  commandId={active.id}
                  active
                  resolvedTheme={prefs.resolvedTheme}
                  onExit={() => void commands.refetch()}
                />
              )}
            </div>
          </>
        )}
      </section>

      <Dialog
        open={draft !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setDraft(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft?.id === null ? "New dev command" : "Edit dev command"}
            </DialogTitle>
            <DialogDescription>
              Runs from the selected repository root.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <Input
                autoFocus
                value={draft?.name ?? ""}
                placeholder="Web server"
                onChange={(e) =>
                  setDraft((d) =>
                    d === null ? d : { ...d, name: e.target.value }
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Command</span>
              <Input
                value={draft?.command ?? ""}
                placeholder="pnpm dev"
                className="font-mono"
                onChange={(e) =>
                  setDraft((d) =>
                    d === null ? d : { ...d, command: e.target.value }
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    saveDraft()
                  }
                }}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDraft}>
              {draft?.id === null ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
