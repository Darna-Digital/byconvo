/**
 * Chat schemas — ACP ("Agent Client Protocol") chats stored locally in
 * `.byconvo/chats.json` inside the selected repository. A chat is a named,
 * repo-scoped conversation with one coding agent (Claude Code, Codex, or
 * opencode) driven over ACP: the agent runs as a subprocess speaking JSON-RPC
 * on stdio, and its streamed `session/update` events are recorded here as a
 * structured transcript so the UI can render message bubbles, tool-call cards,
 * plans and permission prompts — not raw terminal output.
 *
 * Unlike a terminal thread (raw PTY + xterm TUI), a chat's transcript is a flat,
 * ordered list of typed messages. Streaming happens over a WebSocket; this model
 * is the persisted whole-block form a GET returns and a reload replays.
 */
import * as Schema from "effect/Schema"

/** The ACP-capable agents a chat can be bound to. No plain "terminal" — a chat
 * is always a structured conversation with a coding agent. */
export const ChatAgent = Schema.Literals(["claude", "codex", "opencode"])
export type ChatAgent = typeof ChatAgent.Type

/** Tool-call lifecycle status, mirroring ACP's `ToolCallStatus`. */
export const ToolStatus = Schema.Literals([
  "pending",
  "in_progress",
  "completed",
  "failed",
])
export type ToolStatus = typeof ToolStatus.Type

/** Tool category, mirroring ACP's `ToolKind` (drives the card icon). */
export const ToolKind = Schema.Literals([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
])
export type ToolKind = typeof ToolKind.Type

/**
 * A display fragment produced by a tool call — ACP's `ToolCallContent` flattened
 * to the three shapes the UI renders: plain text, a file diff, or a reference to
 * an embedded terminal.
 */
export const ToolContent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("diff"),
    path: Schema.String,
    oldText: Schema.NullOr(Schema.String),
    newText: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("terminal"),
    terminalId: Schema.String,
  }),
])
export type ToolContent = typeof ToolContent.Type

/** A permission choice offered by the agent, mirroring ACP's `PermissionOption`. */
export const PermissionOption = Schema.Struct({
  optionId: Schema.String,
  name: Schema.String,
  kind: Schema.Literals([
    "allow_once",
    "allow_always",
    "reject_once",
    "reject_always",
  ]),
})
export type PermissionOption = typeof PermissionOption.Type

/** The user's answer to a permission request (null while still pending). */
export const PermissionOutcome = Schema.Struct({
  outcome: Schema.Literals(["selected", "cancelled"]),
  optionId: Schema.NullOr(Schema.String),
})
export type PermissionOutcome = typeof PermissionOutcome.Type

/** A single plan entry, mirroring ACP's `PlanEntry`. */
export const PlanEntry = Schema.Struct({
  content: Schema.String,
  priority: Schema.Literals(["high", "medium", "low"]),
  status: Schema.Literals(["pending", "in_progress", "completed"]),
})
export type PlanEntry = typeof PlanEntry.Type

/**
 * One transcript item. A tagged union — every ACP `session/update` variant plus
 * the user's own turns and terminal errors collapse into one of these, in order.
 * Assistant text/reasoning is accumulated whole-block (deltas are a WS-only
 * concern), and `tool_call` + `tool_call_update` events are merged by
 * `toolCallId` into a single `toolCall` message.
 */
export const ChatMessage = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("user"),
    id: Schema.String,
    text: Schema.String,
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("agent"),
    id: Schema.String,
    text: Schema.String,
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("thought"),
    id: Schema.String,
    text: Schema.String,
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("toolCall"),
    id: Schema.String,
    toolCallId: Schema.String,
    title: Schema.String,
    kind: Schema.NullOr(ToolKind),
    status: ToolStatus,
    rawInput: Schema.NullOr(Schema.Unknown),
    content: Schema.Array(ToolContent),
    locations: Schema.Array(Schema.String),
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("plan"),
    id: Schema.String,
    entries: Schema.Array(PlanEntry),
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("permission"),
    id: Schema.String,
    /** Server-minted id correlating the WS ask with the client's answer. */
    requestId: Schema.String,
    toolCallId: Schema.NullOr(Schema.String),
    title: Schema.String,
    options: Schema.Array(PermissionOption),
    outcome: Schema.NullOr(PermissionOutcome),
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("turnEnd"),
    id: Schema.String,
    stopReason: Schema.Literals([
      "end_turn",
      "max_tokens",
      "max_turn_requests",
      "refusal",
      "cancelled",
    ]),
    createdAt: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("error"),
    id: Schema.String,
    message: Schema.String,
    createdAt: Schema.String,
  }),
])
export type ChatMessage = typeof ChatMessage.Type

/** A full chat including its transcript. */
export const Chat = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  /** Which agent drives this chat over ACP. */
  agent: ChatAgent,
  /** The git branch this chat is grouped under (the branch when created). */
  branch: Schema.String,
  /** Optional task key this chat references (cross-feature link). */
  taskKey: Schema.NullOr(Schema.String),
  /** A prompt sent as the chat's first turn once the agent connects, then
   * cleared. Used when a task comment tags an agent. */
  initialPrompt: Schema.String,
  /** The agent's ACP session id, so the conversation can be resumed via
   * `session/load` after the subprocess is gone (server restart / app reopen).
   * null until the first session is created. */
  agentSessionId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  messages: Schema.Array(ChatMessage),
})
export type Chat = typeof Chat.Type

/** A chat without its (potentially large) transcript, for the sidebar. */
export const ChatSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  agent: ChatAgent,
  branch: Schema.String,
  taskKey: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  messageCount: Schema.Number,
  /** A short preview of the last message, for the sidebar subtitle. */
  lastMessage: Schema.NullOr(Schema.String),
})
export type ChatSummary = typeof ChatSummary.Type

export const Ok = Schema.Struct({ ok: Schema.Boolean })
