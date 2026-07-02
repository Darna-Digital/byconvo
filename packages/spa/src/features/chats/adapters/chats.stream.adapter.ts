/**
 * useChatStream — the live view of one chat. Connects to the chat's event
 * WebSocket, adopts the `{snapshot}` the server replays on connect, then folds
 * `{event}` frames through the pure reducer. Reconnects with capped backoff
 * (the server replays a fresh snapshot each time, so no state is lost), except
 * after a server-reported `{error}` (unknown chat / no repo), which is
 * terminal for this id.
 */
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { chatStreamUrl } from "@/lib/api/client"
import type { Chat } from "@/lib/api/types"
import type { ChatWireEvent } from "../entity/chats.interfaces"
import { applyChatEvent } from "../functions/chats.reducer"

interface ChatStreamState {
  readonly chat: Chat | null
  readonly error: string | null
}

export function useChatStream(chatId: string | null): ChatStreamState {
  const [chat, setChat] = useState<Chat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  // The sidebar list mirrors turn state — refresh it when a turn settles.
  const invalidateList = useRef(() => {
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/chats"] })
  })

  useEffect(() => {
    setChat(null)
    setError(null)
    if (chatId === null) return

    let ws: WebSocket | null = null
    let closed = false
    let attempts = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      ws = new WebSocket(chatStreamUrl(chatId))
      ws.onopen = () => {
        attempts = 0
      }
      ws.onmessage = (raw: MessageEvent<string>) => {
        let frame: {
          snapshot?: Chat
          event?: ChatWireEvent
          error?: string
        }
        try {
          frame = JSON.parse(raw.data) as typeof frame
        } catch {
          return
        }
        if (frame.snapshot !== undefined) {
          setChat(frame.snapshot)
        } else if (frame.event !== undefined) {
          const event = frame.event
          setChat((prev) => applyChatEvent(prev, event))
          if (event.type === "turn-completed" || event.type === "turn-started")
            invalidateList.current()
        } else if (frame.error !== undefined) {
          // Terminal: the chat doesn't exist here — reconnecting won't help.
          closed = true
          setError(frame.error)
        }
      }
      ws.onclose = () => {
        if (closed) return
        attempts += 1
        retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** attempts))
      }
    }
    connect()

    return () => {
      closed = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [chatId])

  return { chat, error }
}
