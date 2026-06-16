/**
 * Shared, schema-backed tagged errors for the reviewer server.
 *
 * Each carries an `httpApiStatus` annotation so the HttpApi maps it to the
 * right HTTP status automatically — replacing the hand-written `Effect.catch →
 * 500` wrappers in the old `core/Api.ts`.
 */
import * as Schema from "effect/Schema"

/** A `git` invocation exited non-zero. */
export class GitError extends Schema.TaggedErrorClass<GitError>()(
  "GitError",
  {
    args: Schema.Array(Schema.String),
    exitCode: Schema.Number,
    stderr: Schema.String,
  },
  { httpApiStatus: 500 }
) {
  override get message(): string {
    return `git ${this.args.join(" ")} failed (${this.exitCode}): ${this.stderr.trim()}`
  }
}

/** The local `claude` CLI failed or produced no usable output. */
export class ClaudeError extends Schema.TaggedErrorClass<ClaudeError>()(
  "ClaudeError",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {
  override get message(): string {
    return this.reason
  }
}

/** No repository is currently selected in the workspace. */
export class NoRepoSelected extends Schema.TaggedErrorClass<NoRepoSelected>()(
  "NoRepoSelected",
  {},
  { httpApiStatus: 409 }
) {
  override get message(): string {
    return "no repository selected — pick one with the repository picker"
  }
}

/** A path the user tried to open is not a usable workspace directory. */
export class InvalidRepo extends Schema.TaggedErrorClass<InvalidRepo>()(
  "InvalidRepo",
  { path: Schema.String, reason: Schema.String },
  { httpApiStatus: 400 }
) {
  override get message(): string {
    return `${this.path} is not a git repository: ${this.reason}`
  }
}

/** A filesystem operation failed (read/write/stat/etc.). */
export class StorageError extends Schema.TaggedErrorClass<StorageError>()(
  "StorageError",
  { reason: Schema.String },
  { httpApiStatus: 500 }
) {
  override get message(): string {
    return this.reason
  }
}

/** A GitHub REST call failed or the repo is not a GitHub remote. */
export class GitHubError extends Schema.TaggedErrorClass<GitHubError>()(
  "GitHubError",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {
  override get message(): string {
    return this.reason
  }
}

/** A request referenced something that does not exist (bad sha, file, etc.). */
export class NotFound extends Schema.TaggedErrorClass<NotFound>()(
  "NotFound",
  { reason: Schema.String },
  { httpApiStatus: 404 }
) {
  override get message(): string {
    return this.reason
  }
}
