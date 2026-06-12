# codediff.sh

A local git review tool that works like an IDE. A JetBrains-style vertical
tool rail on the far left switches between three modes; the center is always a
git diff (or file), the bottom is a git panel with branches and history.

![layout](#) <!-- rail · file tree · center diff/file · bottom branches & log -->

## Modes

Switched from the vertical tool rail (far left), JetBrains-style:

- **Commit** — your uncommitted changes. Changed-files tree with a commit
  panel (per-file checkboxes + message), `Commit` / `Commit & Push`. Inline
  comments are stored locally in `.codediff/comments.json`.
- **Pull Requests** — open GitHub PRs (GitLab planned). Pick a PR from the
  bottom panel to review its diff and read/write PR review comments.
- **Browse** — the whole project like an IDE. Click a file in the tree to edit
  it, or a commit in the log to see its patch.

**Edit code in any mode.** Files open in a CodeMirror editor with
syntax-highlighted editing and save-to-disk (Save / ⌘S). In browse mode a tree
click opens the editor; in the diff modes each file header has an **Edit**
button. Saving writes the working-tree file and refreshes the diff/status.

Across all modes: side-by-side (split) or unified diff toggle, push/pull with
ahead/behind counts, double-click a branch to check it out, light & dark
themes, syntax highlighting via Shiki.

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
| `GET/PUT /api/file?path`                | Read / write a file's contents (editor) |
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
