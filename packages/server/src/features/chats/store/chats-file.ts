/**
 * File persistence for chats — `<repo>/.byconvo/chats.json`. Kept as plain
 * (non-Effect) sync fs helpers so both the Effect repository (which wraps these
 * in `Effect.try` + `WorkspaceContext`) and the out-of-Effect ACP session
 * manager (which streams transcript updates while a turn runs) can share exactly
 * one on-disk format and one read-modify-write path. Mutations always merge
 * (read → transform → write) so a streaming transcript append never clobbers a
 * concurrent REST rename, mirroring pty-socket.ts's `patchThread`.
 */
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { Chat } from "../schema/chats.schema.model.ts"

const ChatsFile = Schema.Array(Chat)

const chatsPath = (repoPath: string) => `${repoPath}/.byconvo/chats.json`

export const readChats = (repoPath: string): ReadonlyArray<Chat> => {
  try {
    const raw = readFileSync(chatsPath(repoPath), "utf8")
    const parsed = JSON.parse(raw)
    // Spread defaults before decode so a chats.json written by an older build
    // (missing a later-added field) still parses.
    const normalized = Array.isArray(parsed)
      ? parsed.map((c) =>
          c !== null && typeof c === "object"
            ? {
                branch: "",
                taskKey: null,
                initialPrompt: "",
                agentSessionId: null,
                model: null,
                messages: [],
                ...c,
              }
            : c
        )
      : parsed
    return Schema.decodeUnknownSync(ChatsFile)(normalized)
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

export const readChat = (repoPath: string, id: string): Chat | null =>
  readChats(repoPath).find((c) => c.id === id) ?? null

/**
 * Read-modify-write a single chat by id. Returns the updated chat, or null when
 * no chat with that id exists (the caller decides whether that's an error). The
 * transform runs against the freshest on-disk copy, so concurrent writers merge
 * rather than overwrite.
 */
export const patchChat = (
  repoPath: string,
  id: string,
  transform: (chat: Chat) => Chat
): Chat | null => {
  const chats = readChats(repoPath)
  const existing = chats.find((c) => c.id === id)
  if (existing === undefined) return null
  const updated = transform(existing)
  writeChats(
    repoPath,
    chats.map((c) => (c.id === id ? updated : c))
  )
  return updated
}
