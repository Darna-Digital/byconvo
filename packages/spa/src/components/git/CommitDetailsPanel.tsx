import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { createCommitDetailsFunctions } from "@/features/commit-details/functions/commit-details.functions"
import { useCommitDetail } from "@/lib/queries"
import { cn } from "@/lib/utils"

interface CommitDetailsPanelProps {
  sha: string | null
  onSelectFile: (path: string) => void
}

const formatDateTime = (iso: string): string => {
  if (iso.length === 0) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const indent = (depth: number): React.CSSProperties => ({ paddingLeft: 8 + depth * 14 })

export function CommitDetailsPanel({ sha, onSelectFile }: CommitDetailsPanelProps) {
  const fns = useMemo(() => createCommitDetailsFunctions({ data: {}, sideEffects: {} }), [])
  const detail = useCommitDetail(sha)

  if (sha === null) {
    return (
      <div className="grid h-full place-items-center p-4 text-center text-sm text-muted-foreground">
        Select a commit to see its details.
      </div>
    )
  }
  if (detail.isPending) {
    return (
      <div className="grid h-full place-items-center p-4 text-sm text-muted-foreground">
        Loading commit…
      </div>
    )
  }
  if (detail.error || detail.data === undefined) {
    return (
      <div className="grid h-full place-items-center p-4 text-sm text-destructive">
        Could not load this commit.
      </div>
    )
  }

  const data = detail.data
  const rows = fns.buildRows(data.files)

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <div>
        <div className="font-medium">{data.subject}</div>
        {data.body.length > 0 && (
          <pre className="mt-1 font-sans text-xs whitespace-pre-wrap text-muted-foreground">
            {data.body}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{data.shortSha}</span>
        <span>{data.author}</span>
        {data.authorEmail.length > 0 && <span>&lt;{data.authorEmail}&gt;</span>}
        <span>{formatDateTime(data.authoredAt)}</span>
      </div>

      {data.refs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.refs.map((ref) => (
            <Badge key={ref} variant="secondary" className="font-normal">
              {ref}
            </Badge>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {data.files.length} {data.files.length === 1 ? "file" : "files"}
        </div>
        <ul className="text-sm">
          {rows.map((row, i) =>
            row.kind === "folder" ? (
              <li
                key={`d:${row.label}:${i}`}
                className="flex items-center gap-2 py-0.5 text-muted-foreground"
                style={indent(row.depth)}
              >
                <span className="truncate">{row.label}</span>
                <span className="text-xs">{row.count}</span>
              </li>
            ) : (
              <li key={`f:${row.file.path}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  style={indent(row.depth)}
                  onClick={() => onSelectFile(row.file.path)}
                  title={row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : row.file.path}
                >
                  <span
                    className={cn(
                      "w-3 shrink-0 text-center font-mono text-xs",
                      row.file.status === "added" && "text-emerald-500",
                      row.file.status === "deleted" && "text-destructive",
                      row.file.status === "renamed" && "text-blue-500",
                    )}
                  >
                    {fns.statusLetter(row.file.status)}
                  </span>
                  <span className="truncate">{row.name}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      </div>

      {data.containingBranches.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">
            In {data.containingBranches.length}{" "}
            {data.containingBranches.length === 1 ? "branch" : "branches"}:
          </span>{" "}
          {data.containingBranches.join(", ")}
        </div>
      )}
    </div>
  )
}
