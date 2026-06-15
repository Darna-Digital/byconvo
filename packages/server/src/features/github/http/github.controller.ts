import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import { GitHubError } from "../../../layers/errors.ts"
import { GitHubService } from "../service/github.service.ts"

const pullNumber = (raw: string): Effect.Effect<number, GitHubError> =>
  Number.isInteger(Number(raw))
    ? Effect.succeed(Number(raw))
    : Effect.fail(new GitHubError({ reason: `invalid PR number: ${raw}` }))

export const GitHubController = HttpApiBuilder.group(
  Api,
  "github",
  (handlers) =>
    handlers
      .handle("pulls", () => Effect.flatMap(GitHubService, (s) => s.pulls))
      .handle("pullDiff", ({ params }) =>
        pullNumber(params.number).pipe(
          Effect.flatMap((n) =>
            Effect.flatMap(GitHubService, (s) => s.pullDiff(n))
          )
        )
      )
      .handle("pullComments", ({ params }) =>
        pullNumber(params.number).pipe(
          Effect.flatMap((n) =>
            Effect.flatMap(GitHubService, (s) => s.pullComments(n))
          )
        )
      )
      .handle("createPullComment", ({ params, payload }) =>
        pullNumber(params.number).pipe(
          Effect.flatMap((n) =>
            Effect.flatMap(GitHubService, (s) =>
              s.createPullComment({
                pullNumber: n,
                filePath: payload.filePath,
                side: payload.side,
                lineNumber: payload.lineNumber,
                body: payload.body,
              })
            )
          )
        )
      )
      .handle("replyPullComment", ({ params, payload }) =>
        pullNumber(params.number).pipe(
          Effect.flatMap((n) =>
            pullNumber(params.commentId).pipe(
              Effect.flatMap((commentId) =>
                Effect.flatMap(GitHubService, (s) =>
                  s.replyToPullComment({
                    pullNumber: n,
                    commentId,
                    body: payload.body,
                  })
                )
              )
            )
          )
        )
      )
)
