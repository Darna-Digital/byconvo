import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { useCommitGraph } from "@/features/commit-graph/adapters/commit-graph.hook.adapter"
import { DEFAULT_GRAPH_CONFIG } from "@/features/commit-graph/entity/commit-graph.interfaces"
import type { BranchInfo, CommitInfo, LogQuery } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import { CommitDetailsPanel } from "./CommitDetailsPanel"
import { GraphCell } from "./CommitGraph"
import { LogFilters } from "./LogFilters"

interface CommitHistoryProps {
  refName: string
  branches: ReadonlyArray<BranchInfo>
  commits: ReadonlyArray<CommitInfo>
  query: LogQuery
  loading: boolean
  selectedCommitSha: string | null
  onRefChange: (ref: string) => void
  onQueryChange: (query: LogQuery) => void
  onSelectCommit: (commit: CommitInfo) => void
  onSelectCommitFile: (path: string) => void
}

const formatDate = (iso: string): string => {
  if (iso.length === 0) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function CommitHistory({
  refName,
  branches,
  commits,
  query,
  loading,
  selectedCommitSha,
  onRefChange,
  onQueryChange,
  onSelectCommit,
  onSelectCommitFile,
}: CommitHistoryProps) {
  const { layout, functions } = useCommitGraph(commits)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const [activeSha, setActiveSha] = useState<string | null>(null)

  const effectiveActive = activeSha ?? selectedCommitSha ?? commits[0]?.sha ?? null

  const move = (delta: number) => {
    const idx = commits.findIndex((c) => c.sha === effectiveActive)
    const next = commits[Math.max(0, Math.min(commits.length - 1, idx + delta))]
    if (next) {
      setActiveSha(next.sha)
      rowRefs.current.get(next.sha)?.focus()
    }
  }

  const onKeyDown = (event: React.KeyboardEvent, commit: CommitInfo) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        move(1)
        break
      case "ArrowUp":
        event.preventDefault()
        move(-1)
        break
      case "Home":
        event.preventDefault()
        if (commits[0]) {
          setActiveSha(commits[0].sha)
          rowRefs.current.get(commits[0].sha)?.focus()
        }
        break
      case "End":
        event.preventDefault()
        if (commits.at(-1)) {
          setActiveSha(commits.at(-1)!.sha)
          rowRefs.current.get(commits.at(-1)!.sha)?.focus()
        }
        break
      case "Enter":
      case " ":
        event.preventDefault()
        onSelectCommit(commit)
        break
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LogFilters
        refName={refName}
        branches={branches}
        query={query}
        onRefChange={onRefChange}
        onQueryChange={onQueryChange}
      />

      <div className="flex min-h-0 flex-1">
        <ul
          role="listbox"
          aria-label="Commits"
          aria-busy={loading}
          className="min-h-0 flex-1 overflow-auto"
        >
          {commits.map((commit, index) => {
            const row = layout.rows[index]
            const selected = selectedCommitSha === commit.sha
            const active = effectiveActive === commit.sha
            return (
              <li key={commit.sha} role="option" aria-selected={selected}>
                <div
                  tabIndex={active ? 0 : -1}
                  ref={(el) => {
                    if (el) rowRefs.current.set(commit.sha, el)
                    else rowRefs.current.delete(commit.sha)
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-2 text-sm outline-none",
                    "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    selected && "bg-accent text-accent-foreground",
                  )}
                  style={{ height: DEFAULT_GRAPH_CONFIG.rowHeight }}
                  onFocus={() => setActiveSha(commit.sha)}
                  onClick={() => onSelectCommit(commit)}
                  onKeyDown={(e) => onKeyDown(e, commit)}
                >
                  {row !== undefined && (
                    <GraphCell
                      row={row}
                      width={layout.width}
                      functions={functions}
                      config={DEFAULT_GRAPH_CONFIG}
                    />
                  )}
                  {commit.refs.length > 0 && (
                    <span className="flex shrink-0 gap-1">
                      {commit.refs.slice(0, 3).map((ref) => (
                        <Badge key={ref} variant="secondary" className="px-1 py-0 text-[10px] font-normal">
                          {ref}
                        </Badge>
                      ))}
                    </span>
                  )}
                  <span className="truncate">{commit.subject}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{commit.author}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(commit.authoredAt)}
                  </span>
                </div>
              </li>
            )
          })}
          {commits.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">
              {loading ? "Loading commits…" : "No commits match the current filters."}
            </li>
          )}
        </ul>

        {selectedCommitSha !== null && (
          <div className="w-80 shrink-0 overflow-hidden border-l">
            <CommitDetailsPanel sha={selectedCommitSha} onSelectFile={onSelectCommitFile} />
          </div>
        )}
      </div>
    </div>
  )
}
