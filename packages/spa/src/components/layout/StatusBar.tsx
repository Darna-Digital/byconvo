import { IconGitBranch, IconArrowUp, IconArrowDown } from "@tabler/icons-react"
import type { RepoInfo, RepoStatus } from "@/lib/api/types"
import type { CursorPosition } from "@/components/editor/CodeEditor"

interface StatusBarProps {
  repo: RepoInfo | null
  status: RepoStatus | null
  busy: boolean
  openPath: string | null
  cursor: CursorPosition | null
  onRepoClick: () => void
}

export function StatusBar({ repo, status, busy, openPath, cursor, onRepoClick }: StatusBarProps) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t bg-sidebar px-3 text-xs text-muted-foreground">
      <button className="flex items-center gap-1 hover:text-foreground" onClick={onRepoClick}>
        <IconGitBranch className="size-3.5" />
        {repo?.currentBranch ?? "no repo"}
      </button>
      {status !== null && (status.ahead > 0 || status.behind > 0) && (
        <span className="flex items-center gap-1.5">
          {status.ahead > 0 && (
            <span className="flex items-center gap-0.5">
              <IconArrowUp className="size-3" />
              {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="flex items-center gap-0.5">
              <IconArrowDown className="size-3" />
              {status.behind}
            </span>
          )}
        </span>
      )}
      {status !== null && status.changed > 0 && <span>{status.changed} changed</span>}
      {status !== null && status.headSha.length > 0 && (
        <span className="font-mono">{status.headSha}</span>
      )}
      <div className="ml-auto flex items-center gap-3">
        {busy && <span>working…</span>}
        {openPath !== null && cursor !== null && (
          <span className="font-mono">
            {cursor.line}:{cursor.col}
          </span>
        )}
      </div>
    </footer>
  )
}
