/**
 * The byconvo HTTP API — every feature group mounted under `/api`. This is the
 * single registry the controllers attach their handlers to, mirroring the
 * darna-stack `api.ts`.
 */
import { HttpApi } from "effect/unstable/httpapi"
import { CommentsApi } from "./features/comments/http/comments.api.ts"
import { DocsApi } from "./features/docs/http/docs.api.ts"
import { GitMessageApi } from "./features/git-message/http/git-message.api.ts"
import { GitHubApi } from "./features/github/http/github.api.ts"
import { KanbanApi } from "./features/kanban/http/kanban.api.ts"
import { LocalDevApi } from "./features/local-dev/http/local-dev.api.ts"
import { RepoApi } from "./features/repo/http/repo.api.ts"
import { ThreadsApi } from "./features/threads/http/threads.api.ts"
import { WorkspaceApi } from "./features/workspace/http/workspace.api.ts"

export class Api extends HttpApi.make("byconvo")
  .add(WorkspaceApi)
  .add(RepoApi)
  .add(CommentsApi)
  .add(GitHubApi)
  .add(GitMessageApi)
  .add(ThreadsApi)
  .add(DocsApi)
  .add(KanbanApi)
  .add(LocalDevApi)
  .prefix("/api") {}
