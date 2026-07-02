/**
 * Agent-chat schemas — "chats" are structured agent conversations (distinct
 * from terminal threads, which are raw PTYs). A chat is a repo-scoped thread
 * driven by a locally-installed agent CLI in its non-interactive streaming
 * mode: each user message starts a *turn*, the agent's stream-json output is
 * normalized into message deltas and activities, and the whole conversation is
 * persisted to `.byconvo/chats.json` inside the selected repository.
 *
 * The shape borrows t3code's pragmatic split: messages hold plain streaming
 * text only, while tool calls / thinking / errors are generic *activities*
 * (a `kind` + human summary), so one message model serves every agent.
 */
import * as Schema from "effect/Schema"

/** Which agent CLI backs a chat: Claude Code, Codex, or opencode — the same
 * locally-installed CLIs the terminal threads borrow, in streaming mode. */
export const ChatProviderKind = Schema.Literals(["claude", "codex", "opencode"])
export type ChatProviderKind = typeof ChatProviderKind.Type

/** Reasoning effort, mapped per provider (Claude: thinking-token budget). */
export const ChatEffort = Schema.Literals(["low", "medium", "high"])
export type ChatEffort = typeof ChatEffort.Type

/**
 * What the agent may do without asking. Non-interactive turns cannot pause for
 * approval, so "supervised" means permission-gated tools are simply refused.
 */
export const ChatAccess = Schema.Literals([
  "supervised",
  "acceptEdits",
  "fullAccess",
])
export type ChatAccess = typeof ChatAccess.Type

/** Build = normal agent; Plan = read-only planning mode. */
export const ChatMode = Schema.Literals(["build", "plan"])
export type ChatMode = typeof ChatMode.Type

export const ChatTurnState = Schema.Literals([
  "running",
  "completed",
  "interrupted",
  "error",
])
export type ChatTurnState = typeof ChatTurnState.Type

export const ChatRole = Schema.Literals(["user", "assistant"])
export type ChatRole = typeof ChatRole.Type

export const ChatMessage = Schema.Struct({
  id: Schema.String,
  role: ChatRole,
  /** Markdown text. For a streaming assistant message this grows via deltas
   * over the chat WebSocket and is persisted in full when the turn settles. */
  text: Schema.String,
  /** The turn this message belongs to (user prompt or assistant reply). */
  turnId: Schema.String,
  /** True while the assistant is still producing this message. */
  streaming: Schema.Boolean,
  createdAt: Schema.String,
})
export type ChatMessage = typeof ChatMessage.Type

/** A work-log row: tool call, thinking marker, session note or error. */
export const ChatActivity = Schema.Struct({
  id: Schema.String,
  turnId: Schema.String,
  /** Machine kind, e.g. "tool.started" / "tool.completed" / "thinking". */
  kind: Schema.String,
  tone: Schema.Literals(["info", "tool", "error"]),
  summary: Schema.String,
  /** Optional compact detail (e.g. a tool's input), for expansion in the UI. */
  detail: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})
export type ChatActivity = typeof ChatActivity.Type

export const ChatTurn = Schema.Struct({
  id: Schema.String,
  state: ChatTurnState,
  startedAt: Schema.String,
  endedAt: Schema.NullOr(Schema.String),
  errorMessage: Schema.NullOr(Schema.String),
  /** Reported by the agent when the turn settles (Claude's result event). */
  totalCostUsd: Schema.NullOr(Schema.Number),
})
export type ChatTurn = typeof ChatTurn.Type

/** A full chat including its conversation. */
export const Chat = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  provider: ChatProviderKind,
  /** Provider model id (e.g. "claude-opus-4-8"); "" = the CLI's default. */
  model: Schema.String,
  effort: ChatEffort,
  access: ChatAccess,
  mode: ChatMode,
  /** The git branch this chat was started on (shown with the checkout). */
  branch: Schema.String,
  /** The agent CLI's native session id so later turns `--resume` the same
   * conversation. Chosen up-front for Claude; null until the first turn. */
  sessionId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  messages: Schema.Array(ChatMessage),
  activities: Schema.Array(ChatActivity),
  latestTurn: Schema.NullOr(ChatTurn),
})
export type Chat = typeof Chat.Type

/** A chat without its (potentially large) conversation, for the sidebar. */
export const ChatSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  provider: ChatProviderKind,
  model: Schema.String,
  branch: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  messageCount: Schema.Number,
  lastMessage: Schema.NullOr(Schema.String),
  turnState: Schema.NullOr(ChatTurnState),
})
export type ChatSummary = typeof ChatSummary.Type

// --- Model catalog (drives the composer's model picker) ---------------------

export const ChatModel = Schema.Struct({
  /** The id handed to the CLI's --model flag. */
  id: Schema.String,
  label: Schema.String,
})
export type ChatModel = typeof ChatModel.Type

export const ChatModelProvider = Schema.Struct({
  id: ChatProviderKind,
  label: Schema.String,
  models: Schema.Array(ChatModel),
})
export type ChatModelProvider = typeof ChatModelProvider.Type

export const ChatModelCatalog = Schema.Struct({
  providers: Schema.Array(ChatModelProvider),
  defaults: Schema.Struct({
    provider: ChatProviderKind,
    model: Schema.String,
    effort: ChatEffort,
    access: ChatAccess,
    mode: ChatMode,
  }),
})
export type ChatModelCatalog = typeof ChatModelCatalog.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
