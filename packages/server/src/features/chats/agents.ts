/**
 * Agent presets for ACP chats. A chat is bound to one of these; connecting spawns
 * the agent's ACP *server* as a subprocess speaking JSON-RPC over stdio. The
 * commands are the standard Zed adapters / native ACP modes:
 *   - Claude Code → `npx @zed-industries/claude-code-acp`
 *   - Codex       → `npx @zed-industries/codex-acp`
 *   - opencode    → `opencode acp`
 *
 * Like terminal threads (see ../threads/agents.ts), the command is launched
 * *through* the user's login + interactive shell so it inherits the full PATH a
 * real terminal has (Homebrew, version managers, ~/.local/bin) — a bare spawn
 * under a GUI launch only sees launchd's minimal PATH. `exec` then replaces the
 * shell with the ACP server so, after startup, only the agent writes to the
 * stdout we read as JSON-RPC.
 */
import type { ChatAgent } from "./schema/chats.schema.model.ts"

/** Every chat agent kind, for runtime validation outside the schema layer. */
export const CHAT_AGENTS = [
  "claude",
  "codex",
  "opencode",
] as const satisfies ReadonlyArray<ChatAgent>

export const agentLabel: Record<ChatAgent, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "opencode",
}

/** The default title for a new chat — the agent's name. */
export const agentDefaultTitle = (agent: ChatAgent): string => agentLabel[agent]

export const isChatAgent = (value: string): value is ChatAgent =>
  (CHAT_AGENTS as ReadonlyArray<string>).includes(value)

/** The subprocess spec launched to speak ACP for `agent`. */
export interface AcpLaunchSpec {
  readonly file: string
  readonly args: ReadonlyArray<string>
}

/** The bare ACP-server command for an agent (before the login-shell wrapper). */
const acpCommand = (agent: ChatAgent): string => {
  switch (agent) {
    case "claude":
      return "npx --yes @zed-industries/claude-code-acp"
    case "codex":
      return "npx --yes @zed-industries/codex-acp"
    case "opencode":
      return "opencode acp"
  }
}

const userShell = (): string => process.env["SHELL"] ?? "bash"

/**
 * Build the login-shell invocation that runs `agent`'s ACP server. Mirrors
 * ../threads/agents.ts `agentInShell`: `command -v` first so a missing CLI fails
 * with a clear message instead of a corrupt handshake, then `exec` into it. The
 * command tokens are fixed literals (never user input), so they need no quoting.
 */
export const acpLaunch = (agent: ChatAgent): AcpLaunchSpec => {
  const cmd = acpCommand(agent)
  const probe = cmd.split(" ")[0]
  return {
    file: userShell(),
    args: [
      "-l",
      "-i",
      "-c",
      `command -v ${probe} >/dev/null 2>&1 && exec ${cmd} || { echo "could not start ${probe} — is it installed and on your PATH?" 1>&2; exit 127; }`,
    ],
  }
}
