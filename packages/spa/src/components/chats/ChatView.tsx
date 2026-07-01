/**
 * ChatView — the streaming transcript + composer for one ACP chat. Subscribes to
 * the chat's live WebSocket stream (see lib/chat/chat-stream.ts): the server
 * sends a snapshot + config on connect then message/delta/busy events, and the
 * composer sends prompts, cancels a turn, answers permission prompts, and — via
 * the pickers above the input — switches the agent or model mid-conversation.
 */
import { IconArrowUp, IconLoader2, IconPlayerStop } from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { useLayoutEffect, useRef, useState } from "react"
import { ChatMessageView } from "@/components/chats/ChatMessages"
import { agentIcon } from "@/components/threads/agent-icons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CHAT_AGENTS } from "@/features/chats/entity/agents"
import type { ChatAgent, ChatSummary } from "@/lib/api/types"
import {
  cancelChatTurn,
  respondChatPermission,
  sendChatPrompt,
  setChatAgent,
  setChatModel,
  useChatStream,
} from "@/lib/chat/chat-stream"
import { setUiPrefs } from "@/lib/ui-prefs"

export function ChatView({ chat }: { chat: ChatSummary }) {
  const { messages, status, busy, error, agent, model, models } = useChatStream(
    chat.id
  )
  const queryClient = useQueryClient()
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

  const changeAgent = (next: ChatAgent) => {
    if (next === agent) return
    setChatAgent(chat.id, next)
    // Remember the choice for the next "+" and refresh the sidebar's agent icon.
    setUiPrefs({ lastChatAgent: next })
    void queryClient.invalidateQueries({ queryKey: ["get", "/api/chats"] })
  }

  // The agent picker reflects the live agent once config arrives, else the row.
  const activeAgent: ChatAgent = agent ?? chat.agent

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
        <div className="mx-auto max-w-3xl">
          {/* Agent + model pickers — choose the agent, and a model within it
              (only agents that advertise models over ACP show a model list). */}
          <div className="mb-1.5 flex items-center gap-1.5">
            <Select
              value={activeAgent}
              onValueChange={(v) => changeAgent(v as ChatAgent)}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-auto gap-1.5"
                aria-label="Agent"
              >
                {(() => {
                  const Icon = agentIcon(activeAgent)
                  return (
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  )
                })()}
              </SelectTrigger>
              <SelectContent>
                {CHAT_AGENTS.map((a) => {
                  const Icon = agentIcon(a.kind)
                  return (
                    <SelectItem key={a.kind} value={a.kind}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        {a.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            {models.length > 0 && (
              <Select
                value={model ?? ""}
                onValueChange={(v) => v && setChatModel(chat.id, v)}
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-auto max-w-56 gap-1.5"
                  aria-label="Model"
                >
                  <span className="truncate">
                    {models.find((m) => m.modelId === model)?.name ?? "Model"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.modelId} value={m.modelId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-end gap-2">
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
    </div>
  )
}
