/**
 * Agent presets for the chats UI — the agent selector shown inside a chat and
 * the labels in the sidebar. Mirrors the server's ACP agent set; the server owns
 * how each agent is launched and which models it advertises.
 */
import type { ChatAgent } from "@/lib/api/types"

export const CHAT_AGENTS: ReadonlyArray<{
  kind: ChatAgent
  label: string
  hint: string
}> = [
  { kind: "claude", label: "Claude Code", hint: "claude-code-acp" },
  { kind: "codex", label: "Codex", hint: "codex-acp" },
  { kind: "opencode", label: "opencode", hint: "opencode acp" },
]

export const chatAgentLabel = (agent: ChatAgent): string =>
  CHAT_AGENTS.find((a) => a.kind === agent)?.label ?? agent
