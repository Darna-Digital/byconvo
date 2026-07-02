/**
 * ReviewAssignBar — a Figma-style floating bottom bar that appears while you have
 * local review comments (left in the commit/PR diff or a code view). It lets you
 * pick an agent and hand the comments off to it: a new chat is started with the
 * comments as its prompt. Dismissable; it re-appears when you leave more.
 */
import { IconX } from "@tabler/icons-react"
import { useState } from "react"
import { agentIcon } from "@/components/threads/agent-icons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { isChatProviderKind } from "@/features/chats/functions/chat-assignment.functions"
import { AGENTS, agentLabel } from "@/features/threads/entity/agents"
import type { ChatProviderKind } from "@/lib/api/types"

/** Agent CLIs that can be assigned to chat flows (excludes the plain shell). */
const ASSIGNABLE: ReadonlyArray<{
  kind: ChatProviderKind
  label: string
  hint: string
}> = AGENTS.filter(
  (
    agent
  ): agent is {
    kind: ChatProviderKind
    label: string
    hint: string
  } => isChatProviderKind(agent.kind)
)

export function ReviewAssignBar({
  count,
  onAssign,
  onDismiss,
}: {
  count: number
  onAssign: (agent: ChatProviderKind) => Promise<void> | void
  onDismiss: () => void
}) {
  const [agent, setAgent] = useState<ChatProviderKind>("claude")
  const [busy, setBusy] = useState(false)
  const AgentIcon = agentIcon(agent)

  const changeAgent = (value: ChatProviderKind | null) => {
    if (value === null) return
    setAgent(value)
  }

  const assign = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onAssign(agent)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div className="pointer-events-auto flex animate-in items-center gap-2 rounded-full border bg-popover/95 py-1.5 pr-1.5 pl-4 shadow-lg ring-1 ring-foreground/5 backdrop-blur duration-150 fade-in slide-in-from-bottom-2">
        <span className="text-sm whitespace-nowrap">
          <span className="font-medium tabular-nums">{count}</span>{" "}
          <span className="text-muted-foreground">
            {count === 1 ? "comment" : "comments"}
          </span>
        </span>
        <div className="h-5 w-px bg-border" />
        <Select value={agent} onValueChange={changeAgent}>
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-32 gap-1.5 rounded-full border-0 bg-transparent shadow-none hover:bg-muted"
            aria-label="Agent"
          >
            <AgentIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{agentLabel(agent)}</span>
          </SelectTrigger>
          <SelectContent align="end">
            {ASSIGNABLE.map((a) => {
              const Icon = agentIcon(a.kind)
              return (
                <SelectItem key={a.kind} value={a.kind}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {a.label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="rounded-full"
          disabled={busy}
          onClick={() => void assign()}
        >
          <AgentIcon className="size-4" />
          {busy ? "Starting…" : "Assign to fix"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  )
}
