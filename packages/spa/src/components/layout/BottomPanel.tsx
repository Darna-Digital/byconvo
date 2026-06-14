import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BranchTree } from "@/components/git/BranchTree"
import { CommitHistory } from "@/components/git/CommitHistory"
import { cn } from "@/lib/utils"
import type {
  BranchInfo,
  CommitInfo,
  LogQuery,
  PullRequestInfo,
  RemoteBranchInfo,
} from "@/lib/api/types"

interface BottomPanelProps {
  defaultTab: "branches" | "history" | "pulls"
  hasGitHub: boolean
  branches: ReadonlyArray<BranchInfo>
  remoteBranches: ReadonlyArray<RemoteBranchInfo>
  currentBranch: string | null
  commits: ReadonlyArray<CommitInfo>
  commitsLoading: boolean
  pulls: ReadonlyArray<PullRequestInfo>
  pullsError: string | null
  logRef: string | null
  logFilters: LogQuery
  selectedCommitSha: string | null
  selectedPullNumber: number | null
  onLogRefChange: (ref: string) => void
  onLogFiltersChange: (filters: LogQuery) => void
  onBranchCheckout: (name: string) => void
  onSelectCommit: (commit: CommitInfo) => void
  onSelectCommitFile: (path: string) => void
  onSelectPull: (pull: PullRequestInfo) => void
}

export function BottomPanel(props: BottomPanelProps) {
  const [tab, setTab] = useState<string>(props.defaultTab)

  // Picking a branch from the tree sets the history ref and jumps to History.
  const selectRef = (ref: string) => {
    props.onLogRefChange(ref)
    setTab("history")
  }

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex h-full flex-col gap-0"
    >
      <TabsList className="h-9 w-full justify-start rounded-none border-b bg-transparent px-2">
        <TabsTrigger value="branches">Branches</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        {props.hasGitHub && (
          <TabsTrigger value="pulls">Pull requests</TabsTrigger>
        )}
      </TabsList>

      <TabsContent
        value="branches"
        className="min-h-0 flex-1 overflow-auto p-0"
      >
        <BranchTree
          branches={props.branches}
          remoteBranches={props.remoteBranches}
          currentBranch={props.currentBranch}
          selectedRef={props.logRef}
          onSelect={selectRef}
          onCheckout={props.onBranchCheckout}
        />
      </TabsContent>

      <TabsContent
        value="history"
        className="min-h-0 flex-1 overflow-hidden p-0"
      >
        <CommitHistory
          refName={props.logRef ?? props.currentBranch ?? "HEAD"}
          branches={props.branches}
          commits={props.commits}
          query={props.logFilters}
          loading={props.commitsLoading}
          selectedCommitSha={props.selectedCommitSha}
          onRefChange={props.onLogRefChange}
          onQueryChange={props.onLogFiltersChange}
          onSelectCommit={props.onSelectCommit}
          onSelectCommitFile={props.onSelectCommitFile}
        />
      </TabsContent>

      {props.hasGitHub && (
        <TabsContent value="pulls" className="min-h-0 flex-1 overflow-auto p-0">
          {props.pullsError !== null ? (
            <div className="p-3 text-sm text-destructive">
              {props.pullsError}
            </div>
          ) : props.pulls.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No open pull requests.
            </div>
          ) : (
            <ul className="text-sm">
              {props.pulls.map((p) => (
                <li
                  key={p.number}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted",
                    props.selectedPullNumber === p.number &&
                      "bg-accent text-accent-foreground"
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
