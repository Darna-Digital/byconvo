import { useMemo, useState } from "react"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { GitFileStatus, GitStatusEntry } from "@/lib/api/types"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"

interface CommitPanelProps {
  changes: ReadonlyArray<GitStatusEntry>
  busy: boolean
  onCommit: (
    message: string,
    paths: ReadonlyArray<string>,
    andPush: boolean
  ) => Promise<unknown>
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
  const { commitFilesHeight, commitMessageHeight } = useUiPrefs()
  // Live heights for smooth dragging; committed back to prefs on release.
  const [filesHeight, setFilesHeight] = useState(commitFilesHeight)
  const [messageHeight, setMessageHeight] = useState(commitMessageHeight)
  const [message, setMessage] = useState("")
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(changes.map((c) => c.path))
  )

  // Keep the selection in sync as the change set shifts.
  const paths = useMemo(() => changes.map((c) => c.path).join("\n"), [changes])
  useMemo(() => {
    setSelected((prev) => {
      const next = new Set<string>()
      for (const c of changes) if (prev.has(c.path)) next.add(c.path)
      // Newly appeared files default to selected.
      for (const c of changes)
        if (!prev.has(c.path) && prev.size === 0) next.add(c.path)
      return next.size === 0 && changes.length > 0
        ? new Set(changes.map((c) => c.path))
        : next
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
    <div className="flex shrink-0 flex-col border-t">
      {/* Drag the top edge to grow/shrink the changed-files list. The handle
          straddles the panel's top border (negative margin), so dragging up
          expands the list into the tree above it. */}
      <ResizeHandle
        orientation="row"
        value={filesHeight}
        min={80}
        max={() => Math.max(120, window.innerHeight - 320)}
        direction={-1}
        onResize={setFilesHeight}
        onResizeEnd={(h) => setUiPrefs({ commitFilesHeight: h })}
        label="Resize changed files"
      />
      <div
        className="scroll-thin overflow-y-auto px-3 pt-2"
        style={{ height: filesHeight }}
      >
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
            <span
              className={cn(
                "w-3 font-mono font-medium",
                STATUS_COLOR[c.status]
              )}
            >
              {STATUS_LETTER[c.status]}
            </span>
            <span className="truncate">{c.path}</span>
          </label>
        ))}
      </div>
      {/* Drag the message box's top border to grow/shrink the composer. */}
      <ResizeHandle
        orientation="row"
        value={messageHeight}
        min={48}
        max={() => Math.max(80, window.innerHeight - 360)}
        direction={-1}
        onResize={setMessageHeight}
        onResizeEnd={(h) => setUiPrefs({ commitMessageHeight: h })}
        label="Resize commit message"
      />
      {/* pb-2.5 vertically centres the commit button box on the rail's bottom
          icon (its hover box, not the glyph): the rail icon button is 8px off
          the viewport bottom and taller than our sm button, so matching its
          centre — not its bottom edge — is what visually lines them up. */}
      <div className="flex flex-col gap-2 border-t px-3 pt-3 pb-2.5">
        <Textarea
          value={message}
          placeholder="Commit message…"
          className="resize-none text-sm"
          style={{ height: messageHeight }}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
              void commit(false)
          }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!canCommit}
            onClick={() => void commit(false)}
          >
            Commit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canCommit}
            onClick={() => void commit(true)}
          >
            Commit & push
          </Button>
        </div>
      </div>
    </div>
  )
}
