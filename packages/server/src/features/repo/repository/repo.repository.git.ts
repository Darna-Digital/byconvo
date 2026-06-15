/**
 * Git-backed repo repository — the real implementation. Ports the parsing and
 * command logic from the old `core/Git.ts`, but issues commands through the
 * shared `GitExec` service instead of spawning inline.
 */
import * as Effect from "effect/Effect"
import { GitExec } from "../../../layers/git/git-exec.ts"
import type {
  BranchInfo,
  CommitDetail,
  CommitFileChange,
  CommitInfo,
  GitFileStatus,
  GitStatusEntry,
  RemoteBranchInfo,
  RepoStatus,
} from "../schema/repo.schema.model.ts"
import type { RepoRepo } from "./repo.repository.ts"

const parseStatusLine = (line: string): GitStatusEntry | null => {
  if (line.length < 4) return null
  const xy = line.slice(0, 2)
  let path = line.slice(3)
  const arrow = path.indexOf(" -> ")
  if (arrow >= 0) path = path.slice(arrow + 4)
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)

  const status: GitFileStatus | null =
    xy === "??"
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

const parseGitHubRemote = (
  url: string
): { owner: string; repo: string } | null => {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  const owner = match?.[1]
  const repo = match?.[2]
  return owner !== undefined && repo !== undefined ? { owner, repo } : null
}

const parseTrack = (track: string): { ahead: number; behind: number } => ({
  ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
  behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
})

const parseRefs = (refs: string | undefined): Array<string> =>
  refs === undefined || refs === ""
    ? []
    : refs
        .split(", ")
        .map((r) => r.replace(/^HEAD -> /, ""))
        .filter((r) => r.length > 0)

const parseParents = (parents: string | undefined): Array<string> =>
  parents === undefined || parents === ""
    ? []
    : parents.split(" ").filter((p) => p.length > 0)

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
  const status: GitFileStatus | null =
    code === "A"
      ? "added"
      : code === "D"
        ? "deleted"
        : code === "M" || code === "T"
          ? "modified"
          : null
  return status === null ? null : { path, oldPath: null, status }
}

const FIELD_SEP = "\t"
const branchFormat = [
  "%(refname:short)",
  "%(objectname:short)",
  "%(upstream:short)",
  "%(upstream:track)",
  "%(committerdate:iso8601-strict)",
  "%(subject)",
].join(FIELD_SEP)

const remoteBranchFormat = [
  "%(refname:short)",
  "%(objectname:short)",
  "%(committerdate:iso8601-strict)",
  "%(subject)",
].join(FIELD_SEP)

const logFormat = ["%H", "%h", "%an", "%aI", "%s", "%D", "%P"].join(FIELD_SEP)

const US = "\x1f"
const detailFormat = [
  "%H",
  "%h",
  "%an",
  "%ae",
  "%aI",
  "%s",
  "%D",
  "%P",
  "%b",
].join(US)

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
  conflicted: 0,
}

export const makeGitRepoRepository = Effect.gen(function* () {
  const git = yield* GitExec
  const { lines, run, runVerbose } = git

  const info: RepoRepo["info"] = Effect.gen(function* () {
    const root = (yield* run("rev-parse", "--show-toplevel")).trim()
    const currentBranch = (yield* run(
      "rev-parse",
      "--abbrev-ref",
      "HEAD"
    )).trim()
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
      github: remoteUrl === null ? null : parseGitHubRemote(remoteUrl),
    }
  })

  const files: RepoRepo["files"] = Effect.gen(function* () {
    const tracked = yield* lines("ls-files")
    const untracked = yield* lines("ls-files", "--others", "--exclude-standard")
    const statusLines = yield* lines("status", "--porcelain")
    const gitStatus = statusLines
      .map(parseStatusLine)
      .filter((entry): entry is GitStatusEntry => entry !== null)
    return { paths: [...tracked, ...untracked], gitStatus }
  })

  const status: RepoRepo["status"] = run(
    "status",
    "--porcelain=2",
    "--branch",
    "--untracked-files=all"
  ).pipe(
    Effect.map((out): RepoStatus => {
      let {
        ahead,
        behind,
        branch,
        changed,
        conflicted,
        headSha,
        staged,
        unstaged,
        untracked,
        upstream,
      } = emptyStatus
      for (const line of out.split("\n")) {
        if (line.startsWith("# branch.head ")) {
          branch = line.slice(14).trim()
        } else if (line.startsWith("# branch.oid ")) {
          const oid = line.slice(13).trim()
          headSha = oid.startsWith("(") ? "" : oid.slice(0, 7)
        } else if (line.startsWith("# branch.upstream ")) {
          const up = line.slice(18).trim()
          upstream = up.length > 0 ? up : null
        } else if (line.startsWith("# branch.ab ")) {
          const match = line.slice(12).match(/\+(\d+)\s+-(\d+)/)
          ahead = Number(match?.[1] ?? 0)
          behind = Number(match?.[2] ?? 0)
        } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
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
      return {
        ahead,
        behind,
        branch,
        changed,
        conflicted,
        headSha,
        staged,
        unstaged,
        untracked,
        upstream,
      }
    }),
    Effect.catchTag("GitError", () => Effect.succeed(emptyStatus))
  )

  const branches: RepoRepo["branches"] = Effect.gen(function* () {
    const current = (yield* run("rev-parse", "--abbrev-ref", "HEAD")).trim()
    const refLines = yield* lines(
      "for-each-ref",
      "refs/heads",
      "--sort=-committerdate",
      `--format=${branchFormat}`
    )
    return refLines.flatMap((line): Array<BranchInfo> => {
      const [name, sha, upstream, track, committedAt, subject] =
        line.split(FIELD_SEP)
      if (name === undefined || sha === undefined) return []
      return [
        {
          name,
          sha,
          isCurrent: name === current,
          upstream: upstream === undefined || upstream === "" ? null : upstream,
          ...parseTrack(track ?? ""),
          committedAt: committedAt ?? "",
          subject: subject ?? "",
        },
      ]
    })
  })

  const remoteBranches: RepoRepo["remoteBranches"] = Effect.gen(function* () {
    const refLines = yield* lines(
      "for-each-ref",
      "refs/remotes",
      "--sort=-committerdate",
      `--format=${remoteBranchFormat}`
    )
    return refLines.flatMap((line): Array<RemoteBranchInfo> => {
      const [name, sha, committedAt, subject] = line.split(FIELD_SEP)
      if (name === undefined || sha === undefined) return []
      if (name.endsWith("/HEAD")) return []
      const slash = name.indexOf("/")
      return [
        {
          name,
          remote: slash >= 0 ? name.slice(0, slash) : name,
          shortName: slash >= 0 ? name.slice(slash + 1) : name,
          sha,
          committedAt: committedAt ?? "",
          subject: subject ?? "",
        },
      ]
    })
  })

  const log: RepoRepo["log"] = (query) =>
    Effect.suspend(() => {
      const args = [
        "log",
        `--max-count=${query.limit}`,
        `--format=${logFormat}`,
      ]
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
          const [sha, shortSha, author, authoredAt, subject, refs, parents] =
            line.split(FIELD_SEP)
          if (sha === undefined || shortSha === undefined) return []
          return [
            {
              sha,
              shortSha,
              author: author ?? "",
              authoredAt: authoredAt ?? "",
              subject: subject ?? "",
              refs: parseRefs(refs),
              parents: parseParents(parents),
            },
          ]
        })
      )
    )

  const commitDetail: RepoRepo["commitDetail"] = (sha) =>
    Effect.gen(function* () {
      const raw = yield* run("show", "-s", `--format=${detailFormat}`, sha)
      const [
        full,
        short,
        author,
        email,
        authoredAt,
        subject,
        refs,
        parents,
        ...rest
      ] = raw.split(US)
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
      ).pipe(
        Effect.catchTag("GitError", () =>
          Effect.succeed<ReadonlyArray<string>>([])
        )
      )
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
          .filter((e): e is CommitFileChange => e !== null),
        containingBranches: branchLines.filter(
          (b) => b.length > 0 && !b.startsWith("(")
        ),
      }
    })

  const worktreeDiff: RepoRepo["worktreeDiff"] = run("diff", "HEAD").pipe(
    Effect.catchTag("GitError", () => Effect.succeed(""))
  )

  const rangeDiff: RepoRepo["rangeDiff"] = (base, head) =>
    run("diff", `${base}...${head}`)

  const commitDiff: RepoRepo["commitDiff"] = (sha) =>
    run("show", "--format=", "--patch", sha)

  const checkout: RepoRepo["checkout"] = (branch) =>
    run("checkout", branch).pipe(Effect.asVoid)

  const createBranch: RepoRepo["createBranch"] = (name, startPoint) =>
    (startPoint === null
      ? run("checkout", "-b", name)
      : run("checkout", "-b", name, startPoint)
    ).pipe(Effect.asVoid)

  const headShortSha = Effect.map(run("rev-parse", "--short", "HEAD"), (out) =>
    out.trim()
  )

  const commit: RepoRepo["commit"] = (message, paths) =>
    Effect.gen(function* () {
      if (paths.length === 0) {
        yield* run("add", "-A")
        yield* run("commit", "-m", message)
        return yield* headShortSha
      }
      yield* run("add", "--", ...paths)
      yield* run("commit", "-m", message, "--", ...paths)
      return yield* headShortSha
    })

  const push: RepoRepo["push"] = Effect.gen(function* () {
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

  const pull: RepoRepo["pull"] = runVerbose("pull", "--no-rebase")
  const fetch: RepoRepo["fetch"] = runVerbose("fetch", "--all", "--prune")
  const merge: RepoRepo["merge"] = (branch) => runVerbose("merge", branch)
  const rebase: RepoRepo["rebase"] = (onto) => runVerbose("rebase", onto)

  const renameBranch: RepoRepo["renameBranch"] = (from, to) =>
    run("branch", "-m", from, to).pipe(Effect.asVoid)

  const deleteBranch: RepoRepo["deleteBranch"] = (name, force) =>
    run("branch", force ? "-D" : "-d", name).pipe(Effect.asVoid)

  return {
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
    deleteBranch,
  } satisfies RepoRepo
})
