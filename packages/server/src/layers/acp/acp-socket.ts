/**
 * WebSocket entry point for `/api/chats/stream?id=<chatId>`, and the production
 * `AcpSessionManager` singleton wired to the real agent spawner, the selected
 * repo (via the non-Effect `getCurrentRepo` snapshot, like pty-socket.ts), and
 * `chats.json` persistence. Attached to the shared `upgrade` dispatcher in
 * pty-socket.ts's `attachPtyServer`.
 */
import type { IncomingMessage } from "node:http"
import type { WebSocket } from "ws"
import { getCurrentRepo } from "../workspace/current-repo.ts"
import { patchChat, readChat } from "../../features/chats/store/chats-file.ts"
import { spawnAcpConnection } from "./acp-connection.ts"
import { createAcpSessionManager } from "./acp-session-manager.ts"

export const ACP_CHAT_PATH = "/api/chats/stream"

/** The production registry, shared across the WebSocket handler and the API. */
export const acpSessionManager = createAcpSessionManager({
  connect: spawnAcpConnection,
  loadChat: (chatId) => {
    const repoPath = getCurrentRepo()
    if (repoPath === null) return null
    const chat = readChat(repoPath, chatId)
    return chat === null ? null : { repoPath, chat }
  },
  persist: (chatId, repoPath, update) => {
    try {
      patchChat(repoPath, chatId, (c) => ({
        ...c,
        messages: [...update.messages],
        agentSessionId: update.agentSessionId,
        updatedAt: new Date().toISOString(),
      }))
    } catch {
      // Best-effort: a transient fs error must never wedge a live turn.
    }
  },
})

/** Kill a chat's live agent (called when the chat is deleted). */
export const killChatSession = (chatId: string): void =>
  acpSessionManager.kill(chatId)

export const startAcpSession = (
  ws: WebSocket,
  request: IncomingMessage
): void => {
  const url = new URL(request.url ?? "", "http://localhost")
  const chatId = url.searchParams.get("id")
  if (chatId === null || chatId.length === 0) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ t: "error", message: "missing chat id" }))
    }
    ws.close()
    return
  }
  acpSessionManager.attach(chatId, ws)
}
