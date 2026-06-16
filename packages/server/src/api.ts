/**
 * The reviewer HTTP API — every feature group mounted under `/api`. This is the
 * single registry the controllers attach their handlers to, mirroring the
 * darna-stack `api.ts`.
 */
import { HttpApi } from "effect/unstable/httpapi"
import { CommentsApi } from "./features/comments/http/comments.api.ts"
import { GitMessageApi } from "./features/git-message/http/git-message.api.ts"
import { GitHubApi } from "./features/github/http/github.api.ts"
import { RepoApi } from "./features/repo/http/repo.api.ts"
import { WorkspaceApi } from "./features/workspace/http/workspace.api.ts"

export class Api extends HttpApi.make("reviewer")
  .add(WorkspaceApi)
  .add(RepoApi)
  .add(CommentsApi)
  .add(GitHubApi)
  .add(GitMessageApi)
  .prefix("/api") {}
