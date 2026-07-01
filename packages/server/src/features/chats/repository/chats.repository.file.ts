/**
 * File-backed ACP-chat store — persists chats (with their transcript) to
 * `.byconvo/chats.json` inside the selected repository. CRUD only: the live
 * transcript is streamed in by the ACP session manager (which writes the same
 * file directly, see ../store/chats-file.ts). Mirrors threads.repository.file.ts.
 */
import * as Effect from "effect/Effect"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import {
  applyRename,
  createChat,
  summarize,
  type CreateChatInput,
  type RenameChatInput,
} from "../store/chats-ops.ts"
import { readChats, writeChats } from "../store/chats-file.ts"
import type { Chat } from "../schema/chats.schema.model.ts"
import type { ChatsRepo } from "./chats.repository.ts"

// Module-scoped so ids stay unique across per-request repository instances.
let counter = 0
const nextId = () => {
  counter += 1
  return `c-${Date.now().toString(36)}-${counter}`
}

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
      .map(summarize)
  )

  const get: ChatsRepo["get"] = (id) =>
    withFile((repoPath) => requireChat(repoPath, id))

  const create: ChatsRepo["create"] = (input: CreateChatInput) =>
    withFile((repoPath) => {
      const created = createChat(input, nextId(), new Date().toISOString())
      writeChats(repoPath, [created, ...readChats(repoPath)])
      return created
    })

  const rename: ChatsRepo["rename"] = (id, input: RenameChatInput) =>
    withFile((repoPath) => {
      const existing = requireChat(repoPath, id)
      const updated = applyRename(existing, input, new Date().toISOString())
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

  return { list, get, create, rename, remove } satisfies ChatsRepo
})
