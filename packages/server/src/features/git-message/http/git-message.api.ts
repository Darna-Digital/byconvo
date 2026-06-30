/** HTTP endpoint for AI commit-message drafting. */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  GitError,
  NoRepoSelected,
  TerminalError,
} from "../../../layers/errors.ts"
import { GeneratedMessage } from "../schema/git-message.schema.model.ts"
import { GenerateBody } from "../schema/git-message.schema.requests.ts"

export class GitMessageApi extends HttpApiGroup.make("gitMessage").add(
  HttpApiEndpoint.post("generate", "/git-message/generate", {
    payload: GenerateBody,
    success: GeneratedMessage,
    error: [GitError, NoRepoSelected, TerminalError] as const,
  })
) {}
