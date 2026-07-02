/**
 * Plain-fs chat store — the single reader/writer for `.byconvo/chats.json`.
 *
 * Two very different callers share it, which is why it is framework-free:
 * the Effect repository (per-request CRUD) and the chat turn runtime, which
 * runs outside the Effect runtime (spawned processes + the chat WebSocket are
 * wired straight onto Node, like the PTY sessions) and must persist progress
 * as a turn streams. Keeping every mutation here means there is exactly one
 * shape of the file, whichever side writes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as Schema from "effect/Schema"
import {
  Chat,
  type ChatActivity,
  type ChatMessage,
  type ChatSummary,
  type ChatTurn,
} from "./schema/chats.schema.model.ts"

const ChatsFile = Schema.Array(Chat)
const decodeChatsFile = Schema.decodeUnknownSync(ChatsFile)

const chatsPath = (repoPath: string) => `${repoPath}/.byconvo/chats.json`

export const DEFAULT_CHAT_TITLE = "New thread"

// Module-scoped so ids stay unique across per-request repository instances.
let counter = 0
export const nextChatId = (prefix: string): string => {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export const readChats = (repoPath: string): ReadonlyArray<Chat> => {
  try {
    const raw = readFileSync(chatsPath(repoPath), "utf8")
    return decodeChatsFile(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

export const writeChats = (
  repoPath: string,
  chats: ReadonlyArray<Chat>
): void => {
  mkdirSync(`${repoPath}/.byconvo`, { recursive: true })
  writeFileSync(chatsPath(repoPath), `${JSON.stringify(chats, null, 2)}\n`)
}

export const findChat = (repoPath: string, id: string): Chat | undefined =>
  readChats(repoPath).find((c) => c.id === id)

/** Apply `patch` to one chat and persist; returns the updated chat or
 * undefined when the id is gone (e.g. deleted mid-turn — the write is
 * dropped, never resurrected). */
export const patchChat = (
  repoPath: string,
  id: string,
  patch: (chat: Chat) => Chat
): Chat | undefined => {
  const chats = readChats(repoPath)
  const existing = chats.find((c) => c.id === id)
  if (existing === undefined) return undefined
  const updated = patch(existing)
  writeChats(
    repoPath,
    chats.map((c) => (c.id === id ? updated : c))
  )
  return updated
}

export const summarizeChat = (chat: Chat): ChatSummary => {
  const last = chat.messages.at(-1)
  return {
    id: chat.id,
    title: chat.title,
    provider: chat.provider,
    model: chat.model,
    branch: chat.branch,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
    lastMessage: last !== undefined ? last.text.slice(0, 120) : null,
    turnState: chat.latestTurn?.state ?? null,
  }
}

/** A chat title from the first prompt: its first line, truncated. */
export const titleFromPrompt = (text: string): string => {
  const line = text.trim().split("\n", 1)[0] ?? ""
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

// --- Turn-progress mutations (used by the runtime while a turn streams) -----

export const appendTurnStart = (
  repoPath: string,
  chatId: string,
  input: {
    readonly turn: ChatTurn
    readonly userMessage: ChatMessage
    readonly assistantMessage: ChatMessage
  }
): Chat | undefined =>
  patchChat(repoPath, chatId, (chat) => ({
    ...chat,
    // Name the chat after its first prompt (like t3code's title seed).
    title:
      chat.title === DEFAULT_CHAT_TITLE &&
      titleFromPrompt(input.userMessage.text).length > 0
        ? titleFromPrompt(input.userMessage.text)
        : chat.title,
    updatedAt: input.turn.startedAt,
    messages: [...chat.messages, input.userMessage, input.assistantMessage],
    latestTurn: input.turn,
  }))

export const appendActivity = (
  repoPath: string,
  chatId: string,
  activity: ChatActivity
): Chat | undefined =>
  patchChat(repoPath, chatId, (chat) => ({
    ...chat,
    updatedAt: activity.createdAt,
    activities: [...chat.activities, activity],
  }))

export const saveSessionId = (
  repoPath: string,
  chatId: string,
  sessionId: string
): Chat | undefined =>
  patchChat(repoPath, chatId, (chat) => ({ ...chat, sessionId }))

/** Settle a turn: final assistant text, streaming off, turn state persisted. */
export const completeTurn = (
  repoPath: string,
  chatId: string,
  input: {
    readonly turnId: string
    readonly assistantMessageId: string
    readonly text: string
    readonly state: ChatTurn["state"]
    readonly errorMessage: string | null
    readonly totalCostUsd: number | null
    readonly endedAt: string
  }
): Chat | undefined =>
  patchChat(repoPath, chatId, (chat) => ({
    ...chat,
    updatedAt: input.endedAt,
    messages: chat.messages.map((m) =>
      m.id === input.assistantMessageId
        ? { ...m, text: input.text, streaming: false }
        : m
    ),
    latestTurn:
      chat.latestTurn !== null && chat.latestTurn.id === input.turnId
        ? {
            ...chat.latestTurn,
            state: input.state,
            endedAt: input.endedAt,
            errorMessage: input.errorMessage,
            totalCostUsd: input.totalCostUsd,
          }
        : chat.latestTurn,
  }))
