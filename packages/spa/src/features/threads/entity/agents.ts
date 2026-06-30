/**
 * Agent presets for the threads UI — the "New thread" menu and the labels shown
 * in the sidebar/header. Mirrors the server's agent set; the server owns how
 * each agent's input is turned into a command.
 */
import type { AgentKind } from "@/lib/api/types"

export const AGENTS: ReadonlyArray<{
  kind: AgentKind
  label: string
  hint: string
}> = [
  { kind: "terminal", label: "Terminal", hint: "Run shell commands" },
  { kind: "claude", label: "Claude Code", hint: "claude -p" },
  { kind: "opencode", label: "opencode", hint: "opencode run" },
  { kind: "codex", label: "Codex", hint: "codex exec" },
]

export const agentLabel = (agent: AgentKind): string =>
  AGENTS.find((a) => a.kind === agent)?.label ?? agent

/** A terminal thread runs raw shell; agent threads send prompts to a CLI. */
export const isAgentThread = (agent: AgentKind): boolean => agent !== "terminal"
