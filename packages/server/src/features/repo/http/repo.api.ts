/** HTTP endpoints for git: repo info, files, branches, log, diff, commit, sync. */
import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { GitError, NoRepoSelected } from "../../../layers/errors.ts"
import {
  BranchInfo,
  CommandOutput,
  CommitDetail,
  CommitInfo,
  CommitResult,
  DiffText,
  FilesPayload,
  Ok,
  RemoteBranchInfo,
  RepoInfo,
  RepoStatus,
} from "../schema/repo.schema.model.ts"
import {
  Checkout,
  CommitBody,
  CommitParam,
  CreateBranch,
  DeleteBranch,
  DiffQuery,
  LogQueryParams,
  Merge,
  Rebase,
  RenameBranch,
} from "../schema/repo.schema.requests.ts"

const gitError = [GitError, NoRepoSelected] as const

export class RepoApi extends HttpApiGroup.make("repo")
  .add(HttpApiEndpoint.get("info", "/repo", { success: RepoInfo, error: gitError }))
  .add(HttpApiEndpoint.get("files", "/files", { success: FilesPayload, error: gitError }))
  .add(HttpApiEndpoint.get("status", "/status", { success: RepoStatus, error: gitError }))
  .add(
    HttpApiEndpoint.get("branches", "/branches", {
      success: Schema.Array(BranchInfo),
      error: gitError,
    }),
  )
  .add(
    HttpApiEndpoint.get("remoteBranches", "/remote-branches", {
      success: Schema.Array(RemoteBranchInfo),
      error: gitError,
    }),
  )
  .add(
    HttpApiEndpoint.get("log", "/log", {
      query: LogQueryParams,
      success: Schema.Array(CommitInfo),
      error: gitError,
    }),
  )
  .add(
    HttpApiEndpoint.get("commitDetail", "/commit/:sha", {
      params: CommitParam,
      success: CommitDetail,
      error: gitError,
    }),
  )
  .add(
    HttpApiEndpoint.get("diff", "/diff", { query: DiffQuery, success: DiffText, error: gitError }),
  )
  .add(HttpApiEndpoint.post("checkout", "/checkout", { payload: Checkout, success: Ok, error: gitError }))
  .add(
    HttpApiEndpoint.post("commit", "/commit", {
      payload: CommitBody,
      success: CommitResult,
      error: gitError,
    }),
  )
  .add(HttpApiEndpoint.post("push", "/push", { success: CommandOutput, error: gitError }))
  .add(HttpApiEndpoint.post("pull", "/pull", { success: CommandOutput, error: gitError }))
  .add(HttpApiEndpoint.post("fetch", "/fetch", { success: CommandOutput, error: gitError }))
  .add(HttpApiEndpoint.post("merge", "/merge", { payload: Merge, success: CommandOutput, error: gitError }))
  .add(HttpApiEndpoint.post("rebase", "/rebase", { payload: Rebase, success: CommandOutput, error: gitError }))
  .add(HttpApiEndpoint.post("createBranch", "/branch", { payload: CreateBranch, success: Ok, error: gitError }))
  .add(
    HttpApiEndpoint.post("renameBranch", "/branch/rename", {
      payload: RenameBranch,
      success: Ok,
      error: gitError,
    }),
  )
  .add(
    HttpApiEndpoint.post("deleteBranch", "/branch/delete", {
      payload: DeleteBranch,
      success: Ok,
      error: gitError,
    }),
  ) {}
