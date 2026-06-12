/**
 * Git service — wraps the `git` CLI with Effect.
 */
import { Context, Data, Effect, Layer, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import type {
  BranchInfo,
  CommitInfo,
  FilesPayload,
  GitFileStatus,
  GitStatusEntry,
  RepoInfo
} from "./domain.js"

export class GitError extends Data.TaggedError("GitError")<{
  readonly args: ReadonlyArray<string>
  readonly exitCode: number
  readonly stderr: string
}> {
  override get message(): string {
    return `git ${this.args.join(" ")} failed (${this.exitCode}): ${this.stderr.trim()}`
  }
}

export interface GitShape {
  readonly info: Effect.Effect<RepoInfo, GitError | PlatformError>
  readonly files: Effect.Effect<FilesPayload, GitError | PlatformError>
  readonly branches: Effect.Effect<ReadonlyArray<BranchInfo>, GitError | PlatformError>
  readonly log: (
    ref: string,
    limit: number
  ) => Effect.Effect<ReadonlyArray<CommitInfo>, GitError | PlatformError>
  readonly worktreeDiff: Effect.Effect<string, GitError | PlatformError>
  readonly rangeDiff: (
    base: string,
    head: string
  ) => Effect.Effect<string, GitError | PlatformError>
  readonly commitDiff: (sha: string) => Effect.Effect<string, GitError | PlatformError>
  readonly checkout: (branch: string) => Effect.Effect<void, GitError | PlatformError>
}

export class Git extends Context.Service<Git, GitShape>()("Git") {}

const parseStatusLine = (line: string): GitStatusEntry | null => {
  if (line.length < 4) return null
  const xy = line.slice(0, 2)
  let path = line.slice(3)
  // Renames are reported as "old -> new"; the tree wants the new path.
  const arrow = path.indexOf(" -> ")
  if (arrow >= 0) path = path.slice(arrow + 4)
  if (path.startsWith("\"") && path.endsWith("\"")) path = path.slice(1, -1)

  const status: GitFileStatus | null = xy === "??"
    ? "untracked"
    : xy === "!!"
    ? "ignored"
    : xy.includes("R")
    ? "renamed"
    : xy.includes("A")
    ? "added"
    : xy.includes("D")
    ? "deleted"
    : xy.includes("M") || xy.includes("T") || xy.includes("U")
    ? "modified"
    : null
  return status === null ? null : { path, status }
}

const parseGitHubRemote = (url: string): { owner: string; repo: string } | null => {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  const owner = match?.[1]
  const repo = match?.[2]
  return owner !== undefined && repo !== undefined ? { owner, repo } : null
}

const parseTrack = (track: string): { ahead: number; behind: number } => ({
  ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
  behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0)
})

export const make = (repoPath: string) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const run = (...args: ReadonlyArray<string>) =>
      Effect.scoped(Effect.gen(function*() {
        const handle = yield* spawner.spawn(
          ChildProcess.make("git", args as Array<string>, { cwd: repoPath })
        )
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode
          ],
          { concurrency: "unbounded" }
        )
        if (exitCode !== 0) {
          return yield* Effect.fail(new GitError({ args, exitCode, stderr }))
        }
        return stdout
      }))

    const lines = (...args: ReadonlyArray<string>) =>
      run(...args).pipe(
        Effect.map((out) => out.split("\n").filter((line) => line.length > 0))
      )

    const info: GitShape["info"] = Effect.gen(function*() {
      const root = (yield* run("rev-parse", "--show-toplevel")).trim()
      const currentBranch = (yield* run("rev-parse", "--abbrev-ref", "HEAD")).trim()
      const remoteUrl = yield* run("remote", "get-url", "origin").pipe(
        Effect.map((out) => out.trim()),
        Effect.catchTag("GitError", () => Effect.succeed(null))
      )
      const name = root.split("/").at(-1) ?? root
      return {
        root,
        name,
        currentBranch,
        remoteUrl,
        github: remoteUrl === null ? null : parseGitHubRemote(remoteUrl)
      }
    })

    const files: GitShape["files"] = Effect.gen(function*() {
      const tracked = yield* lines("ls-files")
      const untracked = yield* lines("ls-files", "--others", "--exclude-standard")
      const statusLines = yield* lines("status", "--porcelain")
      const gitStatus = statusLines
        .map(parseStatusLine)
        .filter((entry): entry is GitStatusEntry => entry !== null)
      return { paths: [...tracked, ...untracked], gitStatus }
    })

    const FIELD_SEP = "\t"
    const branchFormat = [
      "%(refname:short)",
      "%(objectname:short)",
      "%(upstream:short)",
      "%(upstream:track)",
      "%(committerdate:iso8601-strict)",
      "%(subject)"
    ].join(FIELD_SEP)

    const branches: GitShape["branches"] = Effect.gen(function*() {
      const current = (yield* run("rev-parse", "--abbrev-ref", "HEAD")).trim()
      const refLines = yield* lines(
        "for-each-ref",
        "refs/heads",
        "--sort=-committerdate",
        `--format=${branchFormat}`
      )
      return refLines.flatMap((line): Array<BranchInfo> => {
        const [name, sha, upstream, track, committedAt, subject] = line.split(FIELD_SEP)
        if (name === undefined || sha === undefined) return []
        return [{
          name,
          sha,
          isCurrent: name === current,
          upstream: upstream === undefined || upstream === "" ? null : upstream,
          ...parseTrack(track ?? ""),
          committedAt: committedAt ?? "",
          subject: subject ?? ""
        }]
      })
    })

    const logFormat = ["%H", "%h", "%an", "%aI", "%s", "%D"].join(FIELD_SEP)

    const log: GitShape["log"] = (ref, limit) =>
      lines("log", `--max-count=${limit}`, `--format=${logFormat}`, ref, "--").pipe(
        Effect.map((logLines) =>
          logLines.flatMap((line): Array<CommitInfo> => {
            const [sha, shortSha, author, authoredAt, subject, refs] = line.split(FIELD_SEP)
            if (sha === undefined || shortSha === undefined) return []
            return [{
              sha,
              shortSha,
              author: author ?? "",
              authoredAt: authoredAt ?? "",
              subject: subject ?? "",
              refs: refs === undefined || refs === ""
                ? []
                : refs.split(", ").filter((r) => r.length > 0)
            }]
          })
        )
      )

    const worktreeDiff: GitShape["worktreeDiff"] = run("diff", "HEAD").pipe(
      // An empty repository has no HEAD yet — show nothing rather than failing.
      Effect.catchTag("GitError", () => Effect.succeed(""))
    )

    const rangeDiff: GitShape["rangeDiff"] = (base, head) => run("diff", `${base}...${head}`)

    const commitDiff: GitShape["commitDiff"] = (sha) =>
      run("show", "--format=", "--patch", sha)

    const checkout: GitShape["checkout"] = (branch) =>
      run("checkout", branch).pipe(Effect.asVoid)

    return Git.of({
      info,
      files,
      branches,
      log,
      worktreeDiff,
      rangeDiff,
      commitDiff,
      checkout
    })
  })

export const layer = (repoPath: string): Layer.Layer<Git, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Layer.effect(Git)(make(repoPath))
