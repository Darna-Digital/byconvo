import { IconGitBranch } from "@tabler/icons-react"
import { repoAvatar } from "@/lib/repo-avatar"
import type { RepoEntry } from "@/lib/api/types"

interface RepoListProps {
  folder: string
  repos: ReadonlyArray<RepoEntry>
  onOpen: (path: string) => void
}

export function RepoList({ folder, repos, onOpen }: RepoListProps) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-3 overflow-auto p-8">
      <div>
        <h2 className="text-base font-medium">{folder.split("/").at(-1)}</h2>
        <p className="text-sm text-muted-foreground">
          {repos.length} {repos.length === 1 ? "repository" : "repositories"}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {repos.map((repo) => {
          const avatar = repoAvatar(repo.name)
          return (
            <li key={repo.path}>
              <button
                className="flex w-full items-center gap-2 rounded-lg border p-3 text-left hover:bg-muted"
                onClick={() => onOpen(repo.path)}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-md text-xs font-semibold text-white"
                  style={{ backgroundColor: avatar.color }}
                >
                  {avatar.initials}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 truncate text-sm font-medium">
                    <IconGitBranch className="size-3.5 text-muted-foreground" />
                    {repo.name}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
