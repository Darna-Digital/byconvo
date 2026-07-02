/**
 * File-backed chat store — persists chats (with their conversations) to
 * `.byconvo/chats.json` inside the selected repository, through the shared
 * plain-fs store the turn runtime also writes through.
 */
import * as Effect from "effect/Effect"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type { Chat } from "../schema/chats.schema.model.ts"
import {
  DEFAULT_CHAT_TITLE,
  nextChatId,
  readChats,
  summarizeChat,
  writeChats,
} from "../store.ts"
import type {
  ChatsRepo,
  CreateChatInput,
  UpdateChatInput,
} from "./chats.repository.ts"

export const makeFileChatsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        // A thrown NotFound is a real 404, not a storage failure — preserve it.
        catch: (error) =>
          error instanceof NotFound
            ? error
            : new StorageError({
                reason: error instanceof Error ? error.message : String(error),
              }),
      })
    )

  const requireChat = (repoPath: string, id: string): Chat => {
    const chat = readChats(repoPath).find((c) => c.id === id)
    if (chat === undefined) {
      throw new NotFound({ reason: `chat ${id} not found` })
    }
    return chat
  }

  const list: ChatsRepo["list"] = withFile((repoPath) =>
    [...readChats(repoPath)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarizeChat)
  )

  const get: ChatsRepo["get"] = (id) =>
    withFile((repoPath) => requireChat(repoPath, id))

  const create: ChatsRepo["create"] = (input: CreateChatInput) =>
    withFile((repoPath) => {
      const now = new Date().toISOString()
      const created: Chat = {
        id: nextChatId("c"),
        title:
          input.title.trim().length > 0
            ? input.title.trim()
            : DEFAULT_CHAT_TITLE,
        provider: input.provider,
        model: input.model,
        effort: input.effort,
        access: input.access,
        mode: input.mode,
        branch: input.branch,
        sessionId: null,
        createdAt: now,
        updatedAt: now,
        messages: [],
        activities: [],
        latestTurn: null,
      }
      writeChats(repoPath, [created, ...readChats(repoPath)])
      return created
    })

  const update: ChatsRepo["update"] = (id, input: UpdateChatInput) =>
    withFile((repoPath) => {
      const existing = requireChat(repoPath, id)
      const provider = input.provider ?? existing.provider
      // Switching the chat's agent invalidates the native session — each CLI
      // mints and can only resume its own — so drop the id (the next turn
      // starts the new agent fresh). A provider change without an explicit
      // model also falls back to that CLI's default rather than keeping the
      // previous agent's model id.
      const providerChanged = provider !== existing.provider
      const updated: Chat = {
        ...existing,
        title:
          input.title !== undefined && input.title.trim().length > 0
            ? input.title.trim()
            : existing.title,
        provider,
        model: input.model ?? (providerChanged ? "" : existing.model),
        effort: input.effort ?? existing.effort,
        access: input.access ?? existing.access,
        mode: input.mode ?? existing.mode,
        sessionId: providerChanged ? null : existing.sessionId,
        updatedAt: new Date().toISOString(),
      }
      writeChats(
        repoPath,
        readChats(repoPath).map((c) => (c.id === id ? updated : c))
      )
      return updated
    })

  const remove: ChatsRepo["remove"] = (id) =>
    withFile((repoPath) => {
      writeChats(
        repoPath,
        readChats(repoPath).filter((c) => c.id !== id)
      )
    })

  return { list, get, create, update, remove } satisfies ChatsRepo
})
