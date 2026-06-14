import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { GitFileStatus, GitStatusEntry } from "@/lib/api/types"

interface CommitPanelProps {
  changes: ReadonlyArray<GitStatusEntry>
  busy: boolean
  onCommit: (message: string, paths: ReadonlyArray<string>, andPush: boolean) => Promise<unknown>
}

const STATUS_COLOR: Record<GitFileStatus, string> = {
  added: "text-emerald-600 dark:text-emerald-400",
  modified: "text-amber-600 dark:text-amber-400",
  deleted: "text-destructive",
  renamed: "text-violet-600 dark:text-violet-400",
  untracked: "text-sky-600 dark:text-sky-400",
  ignored: "text-muted-foreground",
}

const STATUS_LETTER: Record<GitFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  ignored: "I",
}

export function CommitPanel({ changes, busy, onCommit }: CommitPanelProps) {
  const [message, setMessage] = useState("")
  const [selected, setSelected] = useState<Set<string>>(() => new Set(changes.map((c) => c.path)))

  // Keep the selection in sync as the change set shifts.
  const paths = useMemo(() => changes.map((c) => c.path).join("\n"), [changes])
  useMemo(() => {
    setSelected((prev) => {
      const next = new Set<string>()
      for (const c of changes) if (prev.has(c.path)) next.add(c.path)
      // Newly appeared files default to selected.
      for (const c of changes) if (!prev.has(c.path) && prev.size === 0) next.add(c.path)
      return next.size === 0 && changes.length > 0 ? new Set(changes.map((c) => c.path)) : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths])

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const chosen = changes.filter((c) => selected.has(c.path)).map((c) => c.path)
  const canCommit = message.trim().length > 0 && chosen.length > 0 && !busy

  const commit = async (andPush: boolean) => {
    if (!canCommit) return
    const ok = await onCommit(message.trim(), chosen, andPush)
    if (ok !== false) setMessage("")
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t p-3">
      <div className="max-h-40 overflow-auto">
        {changes.map((c) => (
          <label
            key={c.path}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 text-xs hover:bg-muted"
          >
            <Checkbox
              checked={selected.has(c.path)}
              onCheckedChange={() => toggle(c.path)}
              className="size-3.5"
            />
            <span className={cn("w-3 font-mono font-medium", STATUS_COLOR[c.status])}>
              {STATUS_LETTER[c.status]}
            </span>
            <span className="truncate">{c.path}</span>
          </label>
        ))}
      </div>
      <Textarea
        value={message}
        placeholder="Commit message…"
        className="min-h-16 text-sm"
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void commit(false)
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!canCommit} onClick={() => void commit(false)}>
          Commit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canCommit}
          onClick={() => void commit(true)}
        >
          Commit & Push
        </Button>
      </div>
    </div>
  )
}
