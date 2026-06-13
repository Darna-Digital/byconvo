/**
 * Git service — wraps the `git` CLI with Effect.
 */
import { Context, Data, Effect, Layer, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import type {
  BranchInfo,
  CommitDetail,
  CommitFileChange,
  CommitInfo,
  FilesPayload,
  GitFileStatus,
  GitStatusEntry,
  LogQuery,
  RemoteBranchInfo,
  RepoInfo,
  RepoStatus
} from "./domain.js"
import { NoRepoSelected, Workspace } from "./Workspace.js"

export class GitError extends Data.TaggedError("GitError")<{
  readonly args: ReadonlyArray<string>
  readonly exitCode: number
  readonly stderr: string
}> {
  override get message(): string {
    return `git ${this.args.join(" ")} failed (${this.exitCode}): ${this.stderr.trim()}`
  }
}

export type GitFailure = GitError | NoRepoSelected | PlatformError

export interface GitShape {
  readonly info: Effect.Effect<RepoInfo, GitFailure>
  readonly files: Effect.Effect<FilesPayload, GitFailure>
  readonly status: Effect.Effect<RepoStatus, GitFailure>
  readonly branches: Effect.Effect<ReadonlyArray<BranchInfo>, GitFailure>
  readonly remoteBranches: Effect.Effect<ReadonlyArray<RemoteBranchInfo>, GitFailure>
  readonly log: (query: LogQuery) => Effect.Effect<ReadonlyArray<CommitInfo>, GitFailure>
  readonly commitDetail: (sha: string) => Effect.Effect<CommitDetail, GitFailure>
  readonly worktreeDiff: Effect.Effect<string, GitFailure>
  readonly rangeDiff: (
    base: string,
    head: string
  ) => Effect.Effect<string, GitFailure>
  readonly commitDiff: (sha: string) => Effect.Effect<string, GitFailure>
  readonly checkout: (branch: string) => Effect.Effect<void, GitFailure>
  /** Create a new branch (optionally from a start point) and switch to it. */
  readonly createBranch: (
    name: string,
    startPoint: string | null
  ) => Effect.Effect<void, GitFailure>
  /** Commit the given paths (or everything when empty); returns the new short sha. */
  readonly commit: (
    message: string,
    paths: ReadonlyArray<string>
  ) => Effect.Effect<string, GitFailure>
  readonly push: Effect.Effect<string, GitFailure>
  readonly pull: Effect.Effect<string, GitFailure>
  /** Fetch all remotes, pruning deleted upstream branches. */
  readonly fetch: Effect.Effect<string, GitFailure>
  /** Merge a branch into the current branch. */
  readonly merge: (branch: string) => Effect.Effect<string, GitFailure>
  /** Rebase the current branch onto another ref. */
  readonly rebase: (onto: string) => Effect.Effect<string, GitFailure>
  readonly renameBranch: (
    from: string,
    to: string
  ) => Effect.Effect<void, GitFailure>
  readonly deleteBranch: (
    name: string,
    force: boolean
  ) => Effect.Effect<void, GitFailure>
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

export const make = Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const workspace = yield* Workspace

    const run = (...args: ReadonlyArray<string>) =>
      Effect.scoped(Effect.gen(function*() {
        const repoPath = yield* workspace.requireCurrent
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

    // push/pull report progress on stderr — keep it for the UI.
    const runVerbose = (...args: ReadonlyArray<string>) =>
      Effect.scoped(Effect.gen(function*() {
        const repoPath = yield* workspace.requireCurrent
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
        return `${stdout}${stderr}`.trim()
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

    // A single porcelain v2 call yields the branch header (name, upstream,
    // ahead/behind, HEAD sha) plus one line per changed file, so the whole
    // status-bar snapshot comes from one git invocation.
    const emptyStatus: RepoStatus = {
      branch: "",
      upstream: null,
      ahead: 0,
      behind: 0,
      headSha: "",
      changed: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0
    }

    const status: GitShape["status"] = run(
      "status",
      "--porcelain=2",
      "--branch",
      "--untracked-files=all"
    ).pipe(
      Effect.map((out): RepoStatus => {
        let { ahead, behind, branch, changed, conflicted, headSha, staged, unstaged, untracked, upstream } =
          emptyStatus
        for (const line of out.split("\n")) {
          if (line.startsWith("# branch.head ")) {
            branch = line.slice(14).trim()
          } else if (line.startsWith("# branch.oid ")) {
            const oid = line.slice(13).trim()
            // An unborn branch reports "(initial)" rather than a sha.
            headSha = oid.startsWith("(") ? "" : oid.slice(0, 7)
          } else if (line.startsWith("# branch.upstream ")) {
            const up = line.slice(18).trim()
            upstream = up.length > 0 ? up : null
          } else if (line.startsWith("# branch.ab ")) {
            const match = line.slice(12).match(/\+(\d+)\s+-(\d+)/)
            ahead = Number(match?.[1] ?? 0)
            behind = Number(match?.[2] ?? 0)
          } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
            // "<index><worktree>" — a non-"." in either column means staged
            // or unstaged respectively; the file itself counts once.
            const xy = line.slice(2, 4)
            if (xy[0] !== ".") staged++
            if (xy[1] !== ".") unstaged++
            changed++
          } else if (line.startsWith("u ")) {
            conflicted++
            changed++
          } else if (line.startsWith("? ")) {
            untracked++
            changed++
          }
        }
        return { ahead, behind, branch, changed, conflicted, headSha, staged, unstaged, untracked, upstream }
      }),
      // An empty repository (no HEAD) still has a meaningful — empty — status.
      Effect.catchTag("GitError", () => Effect.succeed(emptyStatus))
    )

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

    const remoteBranchFormat = [
      "%(refname:short)",
      "%(objectname:short)",
      "%(committerdate:iso8601-strict)",
      "%(subject)"
    ].join(FIELD_SEP)

    const remoteBranches: GitShape["remoteBranches"] = Effect.gen(function*() {
      const refLines = yield* lines(
        "for-each-ref",
        "refs/remotes",
        "--sort=-committerdate",
        `--format=${remoteBranchFormat}`
      )
      return refLines.flatMap((line): Array<RemoteBranchInfo> => {
        const [name, sha, committedAt, subject] = line.split(FIELD_SEP)
        if (name === undefined || sha === undefined) return []
        // Skip the symbolic "origin/HEAD" pointer — it's not a real branch.
        if (name.endsWith("/HEAD")) return []
        const slash = name.indexOf("/")
        return [{
          name,
          remote: slash >= 0 ? name.slice(0, slash) : name,
          shortName: slash >= 0 ? name.slice(slash + 1) : name,
          sha,
          committedAt: committedAt ?? "",
          subject: subject ?? ""
        }]
      })
    })

    const parseRefs = (refs: string | undefined): Array<string> =>
      refs === undefined || refs === ""
        ? []
        : refs.split(", ").map((r) => r.replace(/^HEAD -> /, "")).filter((r) => r.length > 0)

    const parseParents = (parents: string | undefined): Array<string> =>
      parents === undefined || parents === "" ? [] : parents.split(" ").filter((p) => p.length > 0)

    // %P appends the space-separated parent SHAs that the graph layout needs.
    const logFormat = ["%H", "%h", "%an", "%aI", "%s", "%D", "%P"].join(FIELD_SEP)

    const log: GitShape["log"] = (query) =>
      Effect.suspend(() => {
        const args = ["log", `--max-count=${query.limit}`, `--format=${logFormat}`]
        if (query.author !== null) args.push(`--author=${query.author}`)
        if (query.grep !== null) {
          args.push(`--grep=${query.grep}`)
          args.push(query.regex ? "--extended-regexp" : "--fixed-strings")
          if (!query.caseSensitive) args.push("--regexp-ignore-case")
        }
        if (query.after !== null) args.push(`--after=${query.after}`)
        if (query.before !== null) args.push(`--before=${query.before}`)
        args.push(query.ref, "--")
        if (query.path !== null && query.path.length > 0) args.push(query.path)
        return lines(...args)
      }).pipe(
        Effect.map((logLines) =>
          logLines.flatMap((line): Array<CommitInfo> => {
            const [sha, shortSha, author, authoredAt, subject, refs, parents] = line.split(FIELD_SEP)
            if (sha === undefined || shortSha === undefined) return []
            return [{
              sha,
              shortSha,
              author: author ?? "",
              authoredAt: authoredAt ?? "",
              subject: subject ?? "",
              refs: parseRefs(refs),
              parents: parseParents(parents)
            }]
          })
        )
      )

    // Rename/copy lines carry a similarity score (e.g. "R096"); the first letter
    // is the change kind and the trailing paths give old → new.
    const parseNameStatus = (line: string): CommitFileChange | null => {
      const parts = line.split("\t")
      const code = parts[0]?.[0]
      if (code === "R" || code === "C") {
        const oldPath = parts[1] ?? null
        const path = parts[2] ?? parts[1] ?? ""
        return { path, oldPath, status: code === "R" ? "renamed" : "added" }
      }
      const path = parts[1] ?? ""
      if (path === "") return null
      const status: GitFileStatus | null = code === "A"
        ? "added"
        : code === "D"
        ? "deleted"
        : code === "M" || code === "T"
        ? "modified"
        : null
      return status === null ? null : { path, oldPath: null, status }
    }

    // A non-tab unit separator keeps multi-line commit bodies in one field.
    const US = "\x1f"
    const detailFormat = ["%H", "%h", "%an", "%ae", "%aI", "%s", "%D", "%P", "%b"].join(US)

    const commitDetail: GitShape["commitDetail"] = (sha) =>
      Effect.gen(function*() {
        const raw = yield* run("show", "-s", `--format=${detailFormat}`, sha)
        const [full, short, author, email, authoredAt, subject, refs, parents, ...rest] =
          raw.split(US)
        // -M detects renames; --no-commit-id keeps the diff machine-readable.
        const fileLines = yield* lines(
          "diff-tree",
          "-r",
          "-M",
          "--no-commit-id",
          "--name-status",
          sha
        )
        const branchLines = yield* lines(
          "branch",
          "-a",
          "--contains",
          sha,
          "--format=%(refname:short)"
        ).pipe(Effect.catchTag("GitError", () => Effect.succeed<Array<string>>([])))
        return {
          sha: (full ?? sha).trim(),
          shortSha: (short ?? "").trim(),
          author: author ?? "",
          authorEmail: email ?? "",
          authoredAt: authoredAt ?? "",
          subject: subject ?? "",
          body: rest.join(US).trim(),
          refs: parseRefs(refs),
          parents: parseParents(parents),
          files: fileLines
            .map(parseNameStatus)
            .filter((entry): entry is CommitFileChange => entry !== null),
          containingBranches: branchLines.filter((b) => b.length > 0 && !b.startsWith("("))
        }
      })

    const worktreeDiff: GitShape["worktreeDiff"] = run("diff", "HEAD").pipe(
      // An empty repository has no HEAD yet — show nothing rather than failing.
      Effect.catchTag("GitError", () => Effect.succeed(""))
    )

    const rangeDiff: GitShape["rangeDiff"] = (base, head) => run("diff", `${base}...${head}`)

    const commitDiff: GitShape["commitDiff"] = (sha) =>
      run("show", "--format=", "--patch", sha)

    const checkout: GitShape["checkout"] = (branch) =>
      run("checkout", branch).pipe(Effect.asVoid)

    const createBranch: GitShape["createBranch"] = (name, startPoint) =>
      (startPoint === null
        ? run("checkout", "-b", name)
        : run("checkout", "-b", name, startPoint)
      ).pipe(Effect.asVoid)

    const headShortSha = Effect.map(run("rev-parse", "--short", "HEAD"), (out) => out.trim())

    const commit: GitShape["commit"] = (message, paths) =>
      Effect.gen(function*() {
        if (paths.length === 0) {
          yield* run("add", "-A")
          yield* run("commit", "-m", message)
          return yield* headShortSha
        }
        // `git add` first so untracked files and deletions are included,
        // then commit only the selected paths.
        yield* run("add", "--", ...paths)
        yield* run("commit", "-m", message, "--", ...paths)
        return yield* headShortSha
      })

    const push: GitShape["push"] = Effect.gen(function*() {
      const upstream = yield* run(
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}"
      ).pipe(Effect.catchTag("GitError", () => Effect.succeed(null)))
      return upstream === null
        ? yield* runVerbose("push", "-u", "origin", "HEAD")
        : yield* runVerbose("push")
    })

    // Merge on divergence — plain `git pull` refuses to run without a
    // configured strategy (pull.rebase / pull.ff) on newer git versions.
    const pull: GitShape["pull"] = runVerbose("pull", "--no-rebase")

    const fetch: GitShape["fetch"] = runVerbose("fetch", "--all", "--prune")

    const merge: GitShape["merge"] = (branch) => runVerbose("merge", branch)

    const rebase: GitShape["rebase"] = (onto) => runVerbose("rebase", onto)

    const renameBranch: GitShape["renameBranch"] = (from, to) =>
      run("branch", "-m", from, to).pipe(Effect.asVoid)

    const deleteBranch: GitShape["deleteBranch"] = (name, force) =>
      run("branch", force ? "-D" : "-d", name).pipe(Effect.asVoid)

    return Git.of({
      info,
      files,
      status,
      branches,
      remoteBranches,
      log,
      commitDetail,
      worktreeDiff,
      rangeDiff,
      commitDiff,
      checkout,
      createBranch,
      commit,
      push,
      pull,
      fetch,
      merge,
      rebase,
      renameBranch,
      deleteBranch
    })
  })

export const layer: Layer.Layer<
  Git,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Workspace
> = Layer.effect(Git)(make)
