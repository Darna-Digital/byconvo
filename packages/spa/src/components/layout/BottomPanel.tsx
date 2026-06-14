import { IconGitBranch, IconSearch } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type {
  BranchInfo,
  CommitInfo,
  LogQuery,
  PullRequestInfo,
} from "@/lib/api/types"

interface BottomPanelProps {
  defaultTab: "branches" | "history" | "pulls"
  hasGitHub: boolean
  branches: ReadonlyArray<BranchInfo>
  currentBranch: string | null
  commits: ReadonlyArray<CommitInfo>
  pulls: ReadonlyArray<PullRequestInfo>
  pullsError: string | null
  logFilters: LogQuery
  selectedCommitSha: string | null
  selectedPullNumber: number | null
  onLogFiltersChange: (filters: LogQuery) => void
  onBranchCheckout: (name: string) => void
  onCompare: (base: string, head: string) => void
  onSelectCommit: (commit: CommitInfo) => void
  onSelectPull: (pull: PullRequestInfo) => void
}

const relative = (iso: string): string => {
  if (iso.length === 0) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function BottomPanel(props: BottomPanelProps) {
  return (
    <Tabs defaultValue={props.defaultTab} className="flex h-full flex-col gap-0">
      <TabsList className="h-9 w-full justify-start rounded-none border-b bg-transparent px-2">
        <TabsTrigger value="branches">Branches</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        {props.hasGitHub && <TabsTrigger value="pulls">Pull requests</TabsTrigger>}
      </TabsList>

      <TabsContent value="branches" className="min-h-0 flex-1 overflow-auto p-0">
        <ul className="text-sm">
          {props.branches.map((b) => (
            <li
              key={b.name}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted",
                b.isCurrent && "bg-muted/50",
              )}
              onDoubleClick={() => !b.isCurrent && props.onBranchCheckout(b.name)}
              title="Double-click to check out"
            >
              <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={cn("truncate", b.isCurrent && "font-medium")}>{b.name}</span>
              {(b.ahead > 0 || b.behind > 0) && (
                <span className="text-xs text-muted-foreground">
                  {b.ahead > 0 && `↑${b.ahead}`} {b.behind > 0 && `↓${b.behind}`}
                </span>
              )}
              <span className="ml-auto truncate text-xs text-muted-foreground">{b.subject}</span>
            </li>
          ))}
        </ul>
      </TabsContent>

      <TabsContent value="history" className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <div className="relative border-b p-2">
          <IconSearch className="absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.logFilters.grep ?? ""}
            placeholder="Filter commits…"
            className="h-7 pl-7 text-xs"
            onChange={(e) =>
              props.onLogFiltersChange({
                ...props.logFilters,
                grep: e.target.value.length > 0 ? e.target.value : null,
              })
            }
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-auto text-sm">
          {props.commits.map((c) => (
            <li
              key={c.sha}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted",
                props.selectedCommitSha === c.sha && "bg-muted",
              )}
              onClick={() => props.onSelectCommit(c)}
            >
              <span className="font-mono text-xs text-muted-foreground">{c.shortSha}</span>
              <span className="truncate">{c.subject}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.author}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{relative(c.authoredAt)}</span>
            </li>
          ))}
        </ul>
      </TabsContent>

      {props.hasGitHub && (
        <TabsContent value="pulls" className="min-h-0 flex-1 overflow-auto p-0">
          {props.pullsError !== null ? (
            <div className="p-3 text-sm text-destructive">{props.pullsError}</div>
          ) : props.pulls.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No open pull requests.</div>
          ) : (
            <ul className="text-sm">
              {props.pulls.map((p) => (
                <li
                  key={p.number}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted",
                    props.selectedPullNumber === p.number && "bg-muted",
                  )}
                  onClick={() => props.onSelectPull(p)}
                >
                  <Badge variant="secondary" className="font-mono">
                    #{p.number}
                  </Badge>
                  <span className="truncate">{p.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {p.author} · {p.headRef}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      )}
    </Tabs>
  )
}
