/** GitHub PR repository contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { GitHubError } from "../../../layers/errors.ts"
import type { ReviewComment } from "../../comments/schema/comments.schema.model.ts"
import type { PullRequestInfo } from "../schema/github.schema.model.ts"
import type { PrCommentInput, PrReplyInput } from "../schema/github.schema.requests.ts"

export interface GitHubRepo {
  readonly pulls: Effect.Effect<ReadonlyArray<PullRequestInfo>, GitHubError>
  readonly pullDiff: (pullNumber: number) => Effect.Effect<string, GitHubError>
  readonly pullComments: (
    pullNumber: number,
  ) => Effect.Effect<ReadonlyArray<ReviewComment>, GitHubError>
  readonly createPullComment: (input: PrCommentInput) => Effect.Effect<ReviewComment, GitHubError>
  readonly replyToPullComment: (input: PrReplyInput) => Effect.Effect<ReviewComment, GitHubError>
}

export class GitHubRepository extends Context.Service<GitHubRepository, GitHubRepo>()(
  "GitHubRepository",
) {}
