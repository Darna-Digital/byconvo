/**
 * ChatView — the streaming transcript + composer for one ACP chat. Subscribes to
 * the chat's live WebSocket stream (see lib/chat/chat-stream.ts): the server
 * sends a snapshot on connect then message/delta/busy events, and the composer
 * sends prompts, cancels a turn, and answers permission prompts back over it.
 */
import { IconArrowUp, IconLoader2, IconPlayerStop } from "@tabler/icons-react"
import { useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChatMessageView } from "@/components/chats/ChatMessages"
import {
  cancelChatTurn,
  respondChatPermission,
  sendChatPrompt,
  useChatStream,
} from "@/lib/chat/chat-stream"
import type { ChatSummary } from "@/lib/api/types"

export function ChatView({ chat }: { chat: ChatSummary }) {
  const { messages, status, busy, error } = useChatStream(chat.id)
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)

  // Keep the view pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el !== null && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (el === null) return
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const submit = () => {
    const text = draft.trim()
    if (text.length === 0 || busy) return
    stickToBottom.current = true
    sendChatPrompt(chat.id, text)
    setDraft("")
  }

  const empty = messages.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
          {empty ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {status === "connecting"
                ? "Connecting to the agent…"
                : "Send a message to start the conversation."}
            </div>
          ) : (
            messages.map((m) => (
              <ChatMessageView
                key={m.id}
                message={m}
                onRespond={(requestId, optionId) =>
                  respondChatPermission(chat.id, requestId, optionId)
                }
              />
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> working…
            </div>
          )}
        </div>
      </div>

      {error !== null && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs whitespace-pre-wrap text-destructive">
          {error}
        </div>
      )}

      <div className="border-t p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={`Message ${chat.title}…`}
            className="max-h-48"
          />
          {busy ? (
            <Button
              size="icon"
              variant="outline"
              className="size-9 shrink-0 rounded-full"
              aria-label="Stop"
              onClick={() => cancelChatTurn(chat.id)}
            >
              <IconPlayerStop className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-9 shrink-0 rounded-full"
              aria-label="Send"
              disabled={draft.trim().length === 0}
              onClick={submit}
            >
              <IconArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
