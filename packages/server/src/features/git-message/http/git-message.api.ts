/** HTTP endpoints for AI commit-message drafting + saved commit prefixes. */
import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  ClaudeError,
  GitError,
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import {
  CommitPrefix,
  GeneratedMessage,
  Ok,
} from "../schema/git-message.schema.model.ts"
import {
  GenerateBody,
  NewPrefix,
  PrefixIdParam,
  UpdatePrefix,
} from "../schema/git-message.schema.requests.ts"

export class GitMessageApi extends HttpApiGroup.make("gitMessage")
  .add(
    HttpApiEndpoint.post("generate", "/git-message/generate", {
      payload: GenerateBody,
      success: GeneratedMessage,
      error: [GitError, NoRepoSelected, ClaudeError] as const,
    })
  )
  .add(
    HttpApiEndpoint.get("listPrefixes", "/git-message/prefixes", {
      success: Schema.Array(CommitPrefix),
      error: [StorageError] as const,
    })
  )
  .add(
    HttpApiEndpoint.post("addPrefix", "/git-message/prefixes", {
      payload: NewPrefix,
      success: CommitPrefix,
      error: [StorageError] as const,
    })
  )
  .add(
    HttpApiEndpoint.make("PUT")("updatePrefix", "/git-message/prefixes/:id", {
      params: PrefixIdParam,
      payload: UpdatePrefix,
      success: CommitPrefix,
      error: [StorageError, NotFound] as const,
    })
  )
  .add(
    HttpApiEndpoint.make("DELETE")(
      "removePrefix",
      "/git-message/prefixes/:id",
      {
        params: PrefixIdParam,
        success: Ok,
        error: [StorageError, NotFound] as const,
      }
    )
  ) {}
