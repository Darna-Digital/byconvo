/**
 * The conversation: user prompts as right-aligned bubbles, assistant replies
 * as left-aligned markdown, with each turn's work log (tool calls, thinking)
 * rendered as small collapsed rows above the reply — t3code's timeline shape.
 * Auto-follows the stream unless the reader has scrolled up.
 */
import {
  IconAlertCircle,
  IconBrain,
  IconPlayerStopFilled,
  IconTool,
} from "@tabler/icons-react"
import { useEffect, useRef } from "react"
import type { Chat, ChatActivity, ChatMessage } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import { ChatMarkdown } from "./ChatMarkdown"

function ActivityRow({ activity }: { activity: ChatActivity }) {
  const Icon =
    activity.tone === "error"
      ? IconAlertCircle
      : activity.kind === "thinking"
        ? IconBrain
        : IconTool
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-0.5 text-xs",
        activity.tone === "error" ? "text-destructive" : "text-muted-foreground"
      )}
      title={activity.detail ?? undefined}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{activity.summary}</span>
    </div>
  )
}

function WorkingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Working">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  )
}

export function MessagesTimeline({ chat }: { chat: Chat }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedToBottom = useRef(true)

  // Track whether the reader is at the bottom; only then auto-follow.
  const onScroll = () => {
    const el = scrollRef.current
    if (el === null) return
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useEffect(() => {
    const el = scrollRef.current
    if (el !== null && pinnedToBottom.current) el.scrollTop = el.scrollHeight
  }, [chat])

  const activitiesByTurn = new Map<string, ChatActivity[]>()
  for (const activity of chat.activities) {
    const group = activitiesByTurn.get(activity.turnId) ?? []
    group.push(activity)
    activitiesByTurn.set(activity.turnId, group)
  }

  const running = chat.latestTurn?.state === "running"
  const turnError =
    chat.latestTurn !== null && chat.latestTurn.state === "error"
      ? chat.latestTurn.errorMessage
      : null

  const renderMessage = (message: ChatMessage) => {
    if (message.role === "user") {
      return (
        <div
          key={message.id}
          className="ml-auto max-w-[75%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap"
        >
          {message.text}
        </div>
      )
    }
    const work = activitiesByTurn.get(message.turnId) ?? []
    const streaming = message.streaming && running
    return (
      <div key={message.id} className="flex max-w-3xl flex-col">
        {work.length > 0 && (
          <div className="mb-1 border-l pl-3">
            {work.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </div>
        )}
        {message.text.length > 0 ? (
          <ChatMarkdown text={message.text} />
        ) : streaming ? null : message.streaming ? (
          // A streaming message whose turn is gone (interrupted/server died).
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconPlayerStopFilled className="size-3.5" /> Stopped before
            replying.
          </div>
        ) : null}
        {streaming && <WorkingDots />}
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
        {chat.messages.map(renderMessage)}
        {turnError !== null && (
          <div className="flex max-w-3xl items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words whitespace-pre-wrap">{turnError}</span>
          </div>
        )}
      </div>
    </div>
  )
}
