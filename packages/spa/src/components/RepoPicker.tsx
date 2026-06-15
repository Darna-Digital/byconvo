import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  IconArrowUp,
  IconChevronDown,
  IconFolder,
  IconGitBranch,
} from "@tabler/icons-react"
import { useState } from "react"
import { toast } from "sonner"
import { api, fetchClient } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { repoAvatar } from "@/lib/repo-avatar"
import type { RepoInfo, WorkspaceInfo } from "@/lib/api/types"

interface RepoPickerProps {
  repo: RepoInfo | null
  workspace: WorkspaceInfo | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Avatar({
  name,
  className = "size-4 text-[9px]",
}: {
  name: string
  className?: string
}) {
  const a = repoAvatar(name)
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-sm font-semibold text-white ${className}`}
      style={{ backgroundColor: a.color }}
    >
      {a.initials}
    </span>
  )
}

/** The repo chip in the top bar; opening it reveals a recents + folder browser
 * dropdown (a Popover, so the folder browser's controls don't auto-close it). */
export function RepoPicker({
  repo,
  workspace,
  open,
  onOpenChange,
}: RepoPickerProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [path, setPath] = useState<string | null>(null)
  const browse = api.useQuery(
    "get",
    "/api/fs/browse",
    { params: { query: path === null ? {} : { path } } },
    { enabled: open }
  )

  const choose = async (target: string) => {
    const { error } = await fetchClient.POST("/api/workspace", {
      body: { path: target },
    })
    if (error) {
      toast.error(
        (error as { reason?: string }).reason ?? "could not open repository"
      )
      return
    }
    await queryClient.invalidateQueries()
    onOpenChange(false)
    void navigate({ to: "/commit" })
  }

  const data = browse.data

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="max-w-56 gap-2" />}
      >
        {repo !== null && <Avatar name={repo.name} />}
        <span className="truncate">{repo?.name ?? "Select repository"}</span>
        <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        {workspace !== undefined && workspace.recents.length > 0 && (
          <div className="border-b p-1">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Recent
            </div>
            {workspace.recents.map((recent) => {
              const name = recent.split("/").at(-1) ?? recent
              return (
                <button
                  key={recent}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => void choose(recent)}
                >
                  <Avatar name={name} className="size-5 text-[10px]" />
                  <span className="shrink-0">{name}</span>
                  <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                    {recent}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="p-1">
          <div className="truncate px-2 py-1 text-xs font-medium text-muted-foreground">
            {data?.path ?? "Browse…"}
          </div>
          <div className="max-h-72 overflow-auto">
            {data?.parent != null && (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => setPath(data.parent)}
              >
                <IconArrowUp className="size-4 shrink-0 text-muted-foreground" />
                ..
              </button>
            )}
            {(data?.entries ?? []).map((entry) => (
              <div
                key={entry.path}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setPath(entry.path)}
                >
                  {entry.isGitRepo ? (
                    <IconGitBranch className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <IconFolder className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
                {entry.isGitRepo && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void choose(entry.path)}
                  >
                    Open
                  </Button>
                )}
              </div>
            ))}
          </div>
          {data !== undefined && data.isGitRepo && (
            <div className="border-t p-1 pt-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => void choose(data.path)}
              >
                Open this repository
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
