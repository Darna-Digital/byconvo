/**
 * Capturing native session ids for agents that mint their own (opencode, codex).
 *
 * Unlike Claude Code — where we choose the session id up front and pass it with
 * `--session-id` — opencode and codex generate an id we can't predict. To resume
 * a thread later we must discover the id the CLI created. Each writes its session
 * to a well-known on-disk location that records the working directory, so shortly
 * after a fresh launch we scan for a session file that (a) belongs to this repo's
 * cwd and (b) was written after we launched, and read its id back out.
 *
 * Everything here is best-effort and never throws: a missing dir, a partial
 * write, or an unknown layout just yields no result, and the thread stays
 * un-resumable (it simply starts fresh next time) rather than breaking.
 */
import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface FoundSession {
  readonly id: string
  readonly mtimeMs: number
}

/** opencode: ~/.local/share/opencode/storage/session/<projectID>/<ses_*>.json */
const opencodeSessionsRoot = (): string =>
  join(homedir(), ".local", "share", "opencode", "storage", "session")

const recentOpencode = (cwd: string, sinceMs: number): FoundSession[] => {
  const root = opencodeSessionsRoot()
  const out: FoundSession[] = []
  let projectDirs: string[]
  try {
    projectDirs = readdirSync(root)
  } catch {
    return out
  }
  for (const projectDir of projectDirs) {
    const dir = join(root, projectDir)
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.startsWith("ses_") || !file.endsWith(".json")) continue
      const fullPath = join(dir, file)
      let mtimeMs: number
      try {
        mtimeMs = statSync(fullPath).mtimeMs
      } catch {
        continue
      }
      if (mtimeMs < sinceMs) continue
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf8"))
        // The session JSON records its working directory and its own id.
        if (
          data !== null &&
          typeof data === "object" &&
          data.directory === cwd &&
          typeof data.id === "string"
        ) {
          out.push({ id: data.id, mtimeMs })
        }
      } catch {
        // partial write / not yet flushed — try again on the next poll
      }
    }
  }
  return out
}

/**
 * codex: $CODEX_HOME (or ~/.codex)/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl.
 * The first JSONL line is a `session_meta` record whose `payload` carries the
 * session id and cwd.
 */
const codexSessionsRoot = (): string =>
  join(process.env["CODEX_HOME"] ?? join(homedir(), ".codex"), "sessions")

const firstLine = (text: string): string => {
  const nl = text.indexOf("\n")
  return nl >= 0 ? text.slice(0, nl) : text
}

const recentCodex = (cwd: string, sinceMs: number): FoundSession[] => {
  const out: FoundSession[] = []
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.name.startsWith("rollout-") || !entry.name.endsWith(".jsonl"))
        continue
      let mtimeMs: number
      try {
        mtimeMs = statSync(fullPath).mtimeMs
      } catch {
        continue
      }
      if (mtimeMs < sinceMs) continue
      try {
        const meta = JSON.parse(firstLine(readFileSync(fullPath, "utf8")))
        const payload =
          meta !== null && typeof meta === "object" && "payload" in meta
            ? (meta as { payload: unknown }).payload
            : meta
        if (
          payload !== null &&
          typeof payload === "object" &&
          typeof (payload as { id?: unknown }).id === "string" &&
          (payload as { cwd?: unknown }).cwd === cwd
        ) {
          out.push({ id: (payload as { id: string }).id, mtimeMs })
        }
      } catch {
        // partial write — try again on the next poll
      }
    }
  }
  walk(codexSessionsRoot())
  return out
}

/**
 * Sessions for `agent` whose recorded cwd matches `cwd` and whose file was
 * written at/after `sinceMs` (i.e. created by the launch we're tracking). Empty
 * until the CLI has actually created its session (e.g. on first message).
 */
export const recentAgentSessions = (
  agent: "opencode" | "codex",
  cwd: string,
  sinceMs: number
): FoundSession[] =>
  agent === "opencode"
    ? recentOpencode(cwd, sinceMs)
    : recentCodex(cwd, sinceMs)
