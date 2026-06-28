/**
 * Agent presets for terminal threads. A thread is bound to one of these; running
 * input in it builds the shell command this module returns. Agent CLIs are
 * borrowed from the developer's own install (like GitExec/ClaudeExec) and run in
 * one-shot/non-interactive mode so their output can be captured as a thread entry.
 */
import type { AgentKind } from "./schema/threads.schema.model.ts"

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
 * after the agent (Zed shows the running agent as the thread title).
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
