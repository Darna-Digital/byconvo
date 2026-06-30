/**
 * Agent presets for terminal threads. A thread is bound to one of these; running
 * input in it builds the shell command this module returns. Agent CLIs are
 * borrowed from the developer's own install (like GitExec/ClaudeExec) and run in
 * one-shot/non-interactive mode so their output can be captured as a thread entry.
 */
import type { AgentKind } from "./schema/threads.schema.model.ts"

/** Every agent kind, for runtime validation outside the schema layer. */
export const AGENT_KINDS = [
  "terminal",
  "claude",
  "opencode",
  "codex",
] as const satisfies ReadonlyArray<AgentKind>

/** Single-quote a string for safe interpolation into a `sh -c` command. */
const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`

export const agentLabel: Record<AgentKind, string> = {
  terminal: "Terminal",
  claude: "Claude Code",
  opencode: "opencode",
  codex: "Codex",
}

/**
 * The default title for a new thread of this agent. Terminal threads keep the
 * generic placeholder so the first command renames them; agent threads are named
 * after the agent (the running agent is shown as the thread title).
 */
export const agentDefaultTitle = (agent: AgentKind): string =>
  agent === "terminal" ? "New thread" : agentLabel[agent]

/** Build the shell command that runs `input` for `agent`. */
export const agentCommand = (agent: AgentKind, input: string): string => {
  switch (agent) {
    case "terminal":
      return input
    case "claude":
      return `claude -p ${quote(input)} --output-format text`
    case "opencode":
      return `opencode run ${quote(input)}`
    case "codex":
      return `codex exec ${quote(input)}`
  }
}

export interface PtyProgram {
  readonly file: string
  readonly args: ReadonlyArray<string>
}

/** The user's interactive shell, used both for plain terminals and to host the
 * agent CLIs. */
const userShell = (): string => process.env["SHELL"] ?? "bash"

/**
 * Launch an agent CLI *through* the user's login + interactive shell rather than
 * spawning the bare binary. A bare `node-pty` spawn searches only
 * `process.env.PATH`, which under a GUI launch (the Electron app from Finder, or
 * an IDE) is launchd's minimal PATH — missing `~/.local/bin`, version managers,
 * Homebrew, etc. — so an agent installed there fails with "posix_spawnp failed".
 * `$SHELL -lic` sources the same startup files a real terminal tab does, giving
 * the CLI the exact PATH the developer sees in their terminal. `exec` then hands
 * the PTY straight to the CLI; if it can't be found we print a clear message
 * instead of a bare "command not found". (The CLI names are fixed literals, never
 * user input, so they need no shell-quoting.)
 */
const agentInShell = (cli: string, extraArgs = ""): PtyProgram => {
  const invocation = extraArgs.length > 0 ? `${cli} ${extraArgs}` : cli
  return {
    file: userShell(),
    args: [
      "-l",
      "-i",
      "-c",
      `command -v ${cli} >/dev/null 2>&1 && exec ${invocation} || { echo "could not start ${cli} — is it installed and on your PATH?"; exit 127; }`,
    ],
  }
}

/**
 * The interactive program a live PTY terminal launches for `agent`. Terminal
 * threads open the user's login + interactive shell; agent threads launch the
 * agent CLI in its normal interactive mode (no `-p`) inside that same shell, so
 * it runs as a full TUI with the developer's real PATH and environment.
 *
 * `sessionArgs` (from {@link agentSessionArgs}) start or resume a specific native
 * session so a thread's conversation survives the PTY process dying.
 */
export const agentPtyProgram = (
  agent: AgentKind,
  sessionArgs = ""
): PtyProgram => {
  switch (agent) {
    case "terminal":
      return { file: userShell(), args: ["-l", "-i"] }
    case "claude":
      return agentInShell("claude", sessionArgs)
    case "opencode":
      return agentInShell("opencode", sessionArgs)
    case "codex":
      return agentInShell("codex", sessionArgs)
  }
}

/**
 * Trailing CLI args that make an agent start or resume a specific session, so a
 * thread keeps its conversation across a server restart / app reopen.
 * `sessionId` is the agent's native session id tracked on the thread:
 *   - claude lets us choose the id, so a fresh launch passes `--session-id` and a
 *     later one `--resume`.
 *   - opencode/codex mint their own id (we capture it after the first launch);
 *     we can only resume an existing one, never force one at start.
 * Returns "" to launch the agent fresh.
 */
export const agentSessionArgs = (
  agent: AgentKind,
  opts: { readonly sessionId: string | null; readonly resume: boolean }
) => {
  const { sessionId, resume } = opts
  if (sessionId === null) return ""
  switch (agent) {
    case "terminal":
      return ""
    case "claude":
      return resume ? `--resume ${sessionId}` : `--session-id ${sessionId}`
    case "opencode":
      return resume ? `--session ${sessionId}` : ""
    case "codex":
      return resume ? `resume ${sessionId}` : ""
  }
}
