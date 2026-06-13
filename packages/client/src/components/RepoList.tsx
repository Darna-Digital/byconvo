import type { RepoEntry } from "../types"
import { repoAvatar } from "../repoAvatar"

interface RepoListProps {
  folder: string
  home: string
  repos: ReadonlyArray<RepoEntry>
  onOpen: (path: string) => void
}

const shortenHome = (path: string, home: string): string =>
  path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path

// Center view shown when the open workspace is a plain folder rather than a git
// repo: it lists the git repositories found inside so one can be opened.
export function RepoList({ folder, home, repos, onOpen }: RepoListProps) {
  return (
    <main className="diff-pane repo-list-pane">
      <div className="repo-list">
        <div className="repo-list-header">
          <div className="repo-list-title">Repositories</div>
          <div className="repo-list-subtitle">{shortenHome(folder, home)}</div>
        </div>
        {repos.length === 0 ? (
          <div className="empty-note">No git repositories found in this folder.</div>
        ) : (
          <div className="repo-cards">
            {repos.map((repo) => {
              const avatar = repoAvatar(repo.name)
              return (
                <button
                  key={repo.path}
                  type="button"
                  className="repo-card"
                  onClick={() => onOpen(repo.path)}
                >
                  <span className="repo-avatar" style={{ background: avatar.color }}>
                    {avatar.initials}
                  </span>
                  <span className="repo-card-text">
                    <span className="repo-name">{repo.name}</span>
                    <span className="repo-path">{shortenHome(repo.path, home)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
