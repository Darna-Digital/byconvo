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

/**
 * How to launch an agent's ACP server. We prefer a globally-installed binary
 * (`bin`) and fall back to running the npm package with `pnpm dlx`, then `npx`.
 * Preferring the installed binary is faster (no dlx/npx cold start) and more
 * reliable: some adapters (e.g. codex-acp) ship their real executable as a
 * platform-specific *optional* npm dependency, which `npx` sometimes fails to
 * install (`Cannot find package @zed-industries/codex-acp-darwin-arm64`).
 * `pnpm dlx` and a global install both get it right, and then byconvo uses the
 * binary directly.
 */
interface AgentLaunch {
  /** The command run when the binary is already on PATH. */
  readonly bin: string
  /** The npm package to run via `pnpm dlx` / `npx` when not installed (if any). */
  readonly npxPackage?: string
}

const LAUNCHES: Record<ChatAgent, AgentLaunch> = {
  claude: {
    bin: "claude-code-acp",
    npxPackage: "@zed-industries/claude-code-acp",
  },
  codex: {
    bin: "codex-acp",
    npxPackage: "@zed-industries/codex-acp",
  },
  // opencode ships a single self-contained binary; `opencode acp` is native.
  opencode: { bin: "opencode acp" },
}

const userShell = (): string => process.env["SHELL"] ?? "bash"

/**
 * Build the login-shell invocation that runs `agent`'s ACP server. Mirrors
 * ../threads/agents.ts `agentInShell`: run through `$SHELL -lic` so the CLI
 * inherits the developer's real PATH, `command -v` first so a missing CLI fails
 * with a clear message instead of a corrupt handshake, then `exec` into it —
 * preferring the installed binary, falling back to `npx <package>`. The command
 * tokens are fixed literals (never user input), so they need no quoting.
 */
export const acpLaunch = (agent: ChatAgent): AcpLaunchSpec => {
  const { bin, npxPackage } = LAUNCHES[agent]
  const probe = bin.split(" ")[0]
  const fallback =
    npxPackage === undefined
      ? `echo "could not start ${probe} — is it installed and on your PATH?" 1>&2; exit 127`
      : `command -v pnpm >/dev/null 2>&1 && exec pnpm dlx ${npxPackage} || command -v npx >/dev/null 2>&1 && exec npx --yes ${npxPackage} || { echo "could not start ${probe} — install it (pnpm add -g ${npxPackage}) or ensure pnpm/npx is on your PATH" 1>&2; exit 127; }`
  return {
    file: userShell(),
    args: [
      "-l",
      "-i",
      "-c",
      `command -v ${probe} >/dev/null 2>&1 && exec ${bin} || { ${fallback}; }`,
    ],
  }
}
