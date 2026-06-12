import { useEffect, useMemo, useState } from "react"
import type { GitStatusEntry } from "../types"

interface CommitPanelProps {
  changes: ReadonlyArray<GitStatusEntry>
  busy: boolean
  onCommit: (message: string, paths: ReadonlyArray<string>, andPush: boolean) => Promise<void>
}

const STATUS_LETTER: Record<GitStatusEntry["status"], string> = {
  added: "A",
  deleted: "D",
  ignored: "I",
  modified: "M",
  renamed: "R",
  untracked: "U"
}

export function CommitPanel({ changes, busy, onCommit }: CommitPanelProps) {
  const [message, setMessage] = useState("")
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set())

  // New change set → start from everything selected again.
  const changesKey = changes.map((entry) => entry.path).join("\n")
  useEffect(() => {
    setDeselected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesKey])

  const selectedPaths = useMemo(
    () => changes.filter((entry) => !deselected.has(entry.path)).map((entry) => entry.path),
    [changes, deselected]
  )

  const toggle = (path: string) => {
    setDeselected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const canCommit = message.trim().length > 0 && selectedPaths.length > 0 && !busy

  const commit = (andPush: boolean) => {
    if (!canCommit) return
    // Committing everything and committing an explicit full selection are the
    // same thing — pass the explicit list so partially-staged state never leaks in.
    void onCommit(message.trim(), selectedPaths, andPush).then(() => setMessage(""))
  }

  return (
    <div className="commit-panel">
      <div className="commit-files">
        {changes.map((entry) => (
          <label key={entry.path} className="commit-file" title={entry.path}>
            <input
              type="checkbox"
              checked={!deselected.has(entry.path)}
              onChange={() => toggle(entry.path)}
            />
            <span className={`status-letter status-${entry.status}`}>
              {STATUS_LETTER[entry.status]}
            </span>
            <span className="file-name">{entry.path}</span>
          </label>
        ))}
      </div>
      <textarea
        className="commit-message"
        placeholder="Commit message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") commit(false)
        }}
      />
      <div className="commit-actions">
        <span className="commit-count">
          {selectedPaths.length}/{changes.length} files
        </span>
        <button type="button" className="commit-button" disabled={!canCommit} onClick={() => commit(false)}>
          {busy ? "Working…" : "Commit"}
        </button>
        <button
          type="button"
          className="commit-button push"
          disabled={!canCommit}
          onClick={() => commit(true)}
        >
          Commit & Push
        </button>
      </div>
    </div>
  )
}
