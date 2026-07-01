/**
 * Pure transcript operations over a `Chat`. Every mutation the feature performs —
 * creating a chat, renaming it, appending a transcript message, merging a
 * tool-call update, resolving a permission, recording the ACP session id — is
 * expressed here as a pure `Chat -> Chat` (or array) transform. Both the Effect
 * repositories (file + memory) and the out-of-Effect ACP session manager apply
 * these, so the on-disk shape and the merge rules have a single definition.
 */
import { agentDefaultTitle } from "../agents.ts"
import type {
  Chat,
  ChatAgent,
  ChatMessage,
  ChatSummary,
  PermissionOutcome,
  ToolContent,
  ToolKind,
  ToolStatus,
} from "../schema/chats.schema.model.ts"

export interface CreateChatInput {
  readonly title: string
  readonly agent: ChatAgent
  readonly branch: string
  readonly taskKey: string | null
  readonly initialPrompt: string
}

export interface RenameChatInput {
  readonly title: string
  /** `undefined` leaves the branch untouched. */
  readonly branch?: string
  /** `undefined` leaves the link untouched; `null` clears it. */
  readonly taskKey?: string | null
}

/** Fields of a `tool_call` / `tool_call_update` event, all optional-to-replace. */
export interface ToolCallPatch {
  readonly toolCallId: string
  readonly title?: string
  readonly kind?: ToolKind | null
  readonly status?: ToolStatus
  readonly rawInput?: unknown
  readonly content?: ReadonlyArray<ToolContent>
  readonly locations?: ReadonlyArray<string>
}

const preview = (message: ChatMessage): string | null => {
  switch (message._tag) {
    case "user":
    case "agent":
    case "thought":
      return message.text.trim().slice(0, 120) || null
    case "toolCall":
      return message.title
    case "plan":
      return "Updated plan"
    case "permission":
      return message.title
    case "error":
      return message.message
    case "turnEnd":
      return null
  }
}

/** The sidebar-facing projection of a chat. */
export const summarize = (chat: Chat): ChatSummary => {
  let last: string | null = null
  for (let i = chat.messages.length - 1; i >= 0 && last === null; i -= 1) {
    last = preview(chat.messages[i])
  }
  return {
    id: chat.id,
    title: chat.title,
    agent: chat.agent,
    branch: chat.branch,
    taskKey: chat.taskKey,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    lastMessage: last,
  }
}

export const createChat = (
  input: CreateChatInput,
  id: string,
  now: string
): Chat => ({
  id,
  title:
    input.title.trim().length > 0
      ? input.title.trim()
      : agentDefaultTitle(input.agent),
  agent: input.agent,
  branch: input.branch,
  taskKey: input.taskKey,
  initialPrompt: input.initialPrompt,
  agentSessionId: null,
  model: null,
  createdAt: now,
  updatedAt: now,
  messages: [],
})

export const applyRename = (
  chat: Chat,
  input: RenameChatInput,
  now: string
): Chat => ({
  ...chat,
  title: input.title.trim().length > 0 ? input.title.trim() : chat.title,
  branch: input.branch === undefined ? chat.branch : input.branch,
  taskKey: input.taskKey === undefined ? chat.taskKey : input.taskKey,
  updatedAt: now,
})

/** Append one transcript message and bump `updatedAt`. */
export const appendMessage = (
  chat: Chat,
  message: ChatMessage,
  now: string
): Chat => ({
  ...chat,
  updatedAt: now,
  messages: [...chat.messages, message],
})

/**
 * Merge a `tool_call` / `tool_call_update` into the transcript, keyed by
 * `toolCallId` (ACP replaces fields that are present, keeps the rest). Creates
 * the `toolCall` message on first sight, patches it in place afterwards.
 */
export const upsertToolCall = (
  chat: Chat,
  patch: ToolCallPatch,
  id: string,
  now: string
): Chat => {
  const idx = chat.messages.findIndex(
    (m) => m._tag === "toolCall" && m.toolCallId === patch.toolCallId
  )
  if (idx === -1) {
    const created: ChatMessage = {
      _tag: "toolCall",
      id,
      toolCallId: patch.toolCallId,
      title: patch.title ?? patch.toolCallId,
      kind: patch.kind ?? null,
      status: patch.status ?? "pending",
      rawInput: patch.rawInput ?? null,
      content: [...(patch.content ?? [])],
      locations: [...(patch.locations ?? [])],
      createdAt: now,
      updatedAt: now,
    }
    return appendMessage(chat, created, now)
  }
  const existing = chat.messages[idx]
  if (existing._tag !== "toolCall") return chat
  const merged: ChatMessage = {
    ...existing,
    title: patch.title ?? existing.title,
    kind: patch.kind === undefined ? existing.kind : patch.kind,
    status: patch.status ?? existing.status,
    rawInput: patch.rawInput === undefined ? existing.rawInput : patch.rawInput,
    content:
      patch.content === undefined ? existing.content : [...patch.content],
    locations:
      patch.locations === undefined ? existing.locations : [...patch.locations],
    updatedAt: now,
  }
  const messages = chat.messages.map((m, i) => (i === idx ? merged : m))
  return { ...chat, updatedAt: now, messages }
}

/** Record the user's answer to a pending permission request. */
export const resolvePermission = (
  chat: Chat,
  requestId: string,
  outcome: PermissionOutcome,
  now: string
): Chat => {
  const messages = chat.messages.map((m) =>
    m._tag === "permission" && m.requestId === requestId ? { ...m, outcome } : m
  )
  return { ...chat, updatedAt: now, messages }
}

export const setAgentSessionId = (
  chat: Chat,
  agentSessionId: string,
  now: string
): Chat => ({ ...chat, agentSessionId, updatedAt: now })
