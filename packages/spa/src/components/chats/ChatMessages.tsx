/**
 * Renders one ACP chat transcript message by its tag: user/assistant bubbles,
 * reasoning, tool-call cards, plans, interactive permission prompts, turn
 * boundaries and errors. Pure presentation — the permission buttons call back up
 * to the view, which forwards the answer over the chat WebSocket.
 */
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconCircleCheck,
  IconCircleDot,
  IconEdit,
  IconEye,
  IconLoader2,
  IconSearch,
  IconTerminal2,
  IconTool,
  IconX,
} from "@tabler/icons-react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ChatMessage } from "@/lib/api/types"
import { cn } from "@/lib/utils"

type ToolKind = Extract<ChatMessage, { _tag: "toolCall" }>["kind"]
type ToolStatus = Extract<ChatMessage, { _tag: "toolCall" }>["status"]
type ToolContent = Extract<ChatMessage, { _tag: "toolCall" }>["content"][number]

const md = (text: string) => (
  <div className="markdown text-sm break-words">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {text}
    </Markdown>
  </div>
)

const toolIcon = (kind: ToolKind) => {
  switch (kind) {
    case "read":
      return IconEye
    case "edit":
    case "move":
    case "delete":
      return IconEdit
    case "search":
    case "fetch":
      return IconSearch
    case "execute":
      return IconTerminal2
    default:
      return IconTool
  }
}

function ToolStatusBadge({ status }: { status: ToolStatus }) {
  if (status === "completed")
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-emerald-600 dark:text-emerald-400"
      >
        <IconCheck className="size-3" /> done
      </Badge>
    )
  if (status === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <IconX className="size-3" /> failed
      </Badge>
    )
  if (status === "in_progress")
    return (
      <Badge variant="secondary" className="gap-1">
        <IconLoader2 className="size-3 animate-spin" /> running
      </Badge>
    )
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      pending
    </Badge>
  )
}

function ToolContentView({ item }: { item: ToolContent }) {
  if (item.type === "diff") {
    const oldLines = (item.oldText ?? "").split("\n")
    const newLines = item.newText.split("\n")
    return (
      <div className="mt-1.5 overflow-x-auto rounded-md border font-mono text-xs">
        <div className="border-b bg-muted/50 px-2 py-1 text-muted-foreground">
          {item.path}
        </div>
        {oldLines.map((l, i) =>
          l.length > 0 ? (
            <div
              key={`o${i}`}
              className="bg-destructive/10 px-2 text-destructive"
            >
              - {l}
            </div>
          ) : null
        )}
        {newLines.map((l, i) => (
          <div
            key={`n${i}`}
            className="bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-400"
          >
            + {l}
          </div>
        ))}
      </div>
    )
  }
  if (item.type === "terminal") {
    return (
      <div className="mt-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
        terminal {item.terminalId}
      </div>
    )
  }
  return (
    <pre className="mt-1.5 max-h-64 overflow-auto rounded-md bg-muted/40 px-2 py-1.5 font-mono text-xs whitespace-pre-wrap">
      {item.text}
    </pre>
  )
}

function ToolCard({
  message,
}: {
  message: Extract<ChatMessage, { _tag: "toolCall" }>
}) {
  const Icon = toolIcon(message.kind)
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {message.title}
        </span>
        <ToolStatusBadge status={message.status} />
      </div>
      {message.content.map((item, i) => (
        <ToolContentView key={i} item={item} />
      ))}
    </div>
  )
}

function PlanCard({
  message,
}: {
  message: Extract<ChatMessage, { _tag: "plan" }>
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Plan
      </div>
      <ul className="space-y-1">
        {message.entries.map((e, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {e.status === "completed" ? (
              <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : e.status === "in_progress" ? (
              <IconCircleDot className="mt-0.5 size-4 shrink-0 text-sky-500" />
            ) : (
              <IconChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                e.status === "completed" && "text-muted-foreground line-through"
              )}
            >
              {e.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PermissionCard({
  message,
  onRespond,
}: {
  message: Extract<ChatMessage, { _tag: "permission" }>
  onRespond: (requestId: string, optionId: string | null) => void
}) {
  const answered = message.outcome !== null
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconAlertTriangle className="size-4 shrink-0 text-amber-500" />
        {message.title}
      </div>
      {answered ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {message.outcome?.outcome === "selected"
            ? `Answered: ${
                message.options.find(
                  (o) => o.optionId === message.outcome?.optionId
                )?.name ?? message.outcome?.optionId
              }`
            : "Cancelled"}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.options.map((o) => (
            <Button
              key={o.optionId}
              size="sm"
              variant={o.kind.startsWith("allow") ? "default" : "outline"}
              onClick={() => onRespond(message.requestId, o.optionId)}
            >
              {o.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatMessageView({
  message,
  onRespond,
}: {
  message: ChatMessage
  onRespond: (requestId: string, optionId: string | null) => void
}) {
  switch (message._tag) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
            {message.text}
          </div>
        </div>
      )
    case "agent":
      return <div className="max-w-full">{md(message.text)}</div>
    case "thought":
      return (
        <div className="border-l-2 border-muted pl-3 text-sm text-muted-foreground italic">
          {message.text}
        </div>
      )
    case "toolCall":
      return <ToolCard message={message} />
    case "plan":
      return <PlanCard message={message} />
    case "permission":
      return <PermissionCard message={message} onRespond={onRespond} />

    case "error":
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message.message}
        </div>
      )
    case "turnEnd":
      return message.stopReason === "end_turn" ? null : (
        <div className="py-1 text-center text-xs text-muted-foreground">
          {message.stopReason === "cancelled"
            ? "— stopped —"
            : `— ${message.stopReason.replace(/_/g, " ")} —`}
        </div>
      )
  }
}
