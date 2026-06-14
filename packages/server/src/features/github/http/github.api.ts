import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { GitHubError } from "../../../layers/errors.ts"
import { ReviewComment } from "../../comments/schema/comments.schema.model.ts"
import { DiffText, PullRequestInfo } from "../schema/github.schema.model.ts"
import {
  PrComment,
  PrReply,
  PullNumberParam,
  PullReplyParams,
} from "../schema/github.schema.requests.ts"

export class GitHubApi extends HttpApiGroup.make("github")
  .add(
    HttpApiEndpoint.get("pulls", "/github/pulls", {
      success: Schema.Array(PullRequestInfo),
      error: GitHubError,
    }),
  )
  .add(
    HttpApiEndpoint.get("pullDiff", "/github/pulls/:number/diff", {
      params: PullNumberParam,
      success: DiffText,
      error: GitHubError,
    }),
  )
  .add(
    HttpApiEndpoint.get("pullComments", "/github/pulls/:number/comments", {
      params: PullNumberParam,
      success: Schema.Array(ReviewComment),
      error: GitHubError,
    }),
  )
  .add(
    HttpApiEndpoint.post("createPullComment", "/github/pulls/:number/comments", {
      params: PullNumberParam,
      payload: PrComment,
      success: ReviewComment,
      error: GitHubError,
    }),
  )
  .add(
    HttpApiEndpoint.post("replyPullComment", "/github/pulls/:number/comments/:commentId/replies", {
      params: PullReplyParams,
      payload: PrReply,
      success: ReviewComment,
      error: GitHubError,
    }),
  ) {}
