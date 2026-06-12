# codediff.sh

A local git review tool. Review your working tree, compare branches, inspect
commits, and read GitHub pull requests — with inline comments — in a clean,
minimal UI.

![layout](#) <!-- left: file tree · center: diff · bottom: branches & log -->

## Features

- **Working tree review** — see uncommitted changes against `HEAD`
- **Branch compare** — three-dot diff (`base...head`) between any two branches
- **Commit review** — click any commit in the log to see its patch
- **GitHub sync** — list open PRs, read PR diffs, and read/write PR review
  comments (GitLab planned)
- **Inline comments** — click a line number to leave a comment; local comments
  are stored in `.codediff/comments.json` inside the reviewed repo, PR comments
  go to GitHub
- **JetBrains-style git panel** — branches on the left, commit log on the
  right, double-click a branch to check it out
- Light & dark themes, syntax highlighting via Shiki

Built on [`@pierre/trees`](https://trees.software/) for the file tree and
[`@pierre/diffs`](https://diffs.com/) for diff rendering.

## Architecture

```
packages/
  client/   React 19 + Vite + TypeScript UI
  core/     Effect v4 backend — wraps the git CLI and the GitHub REST API,
            serves the HTTP API consumed by the client
```

The core is a small HTTP server (`effect/unstable/http` + `@effect/platform-node`)
exposing `/api/*`; the Vite dev server proxies to it.

## Getting started

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173 and pick a repository: click the repo chip in
the top bar to open the repository picker — recent repos plus a directory
browser over your machine. The selection persists in `~/.codediff/state.json`
across restarts.

| Env var          | Default | Purpose                              |
| ---------------- | ------- | ------------------------------------ |
| `CODEDIFF_REPO`  | `cwd`   | Initial repository (UI picker overrides it) |
| `CODEDIFF_PORT`  | `4317`  | Core API port                        |
| `GITHUB_TOKEN`   | —       | GitHub auth (falls back to `gh auth token`) |

## API overview

| Route                                  | Purpose                          |
| -------------------------------------- | -------------------------------- |
| `GET/POST /api/workspace`               | Current repo + recents / switch repo |
| `GET /api/fs/browse?path`               | Browse directories, git repos flagged |
| `GET /api/repo`                         | Repo info, current branch, GitHub remote |
| `GET /api/files`                        | Tracked + untracked paths, git status |
| `GET /api/branches`                     | Local branches with ahead/behind |
| `GET /api/log?ref&limit`                | Commit log                       |
| `GET /api/diff[?base&head | ?commit]`   | Raw unified diff                 |
| `POST /api/checkout`                    | Check out a branch               |
| `GET/POST /api/comments`, `DELETE /api/comments/:id` | Local inline comments |
| `GET /api/github/pulls`                 | Open PRs                         |
| `GET /api/github/pulls/:n/diff`         | PR diff                          |
| `GET/POST /api/github/pulls/:n/comments`| PR review comments               |

## Development

```bash
pnpm typecheck   # both packages
pnpm build       # both packages
```
