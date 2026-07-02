/**
 * ChatsPage — the /chats layout: a resizable sidebar listing the repo's agent
 * chats (newest first, live turn state dot) beside the routed content (the
 * new-thread composer on the index, a conversation on /chats/$chatId).
 */
import { IconPlus, IconX } from "@tabler/icons-react"
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { Button } from "@/components/ui/button"
import { useChatsActions } from "@/features/chats/adapters/chats.hook.adapter"
import type { ChatSummary } from "@/lib/api/types"
import { useChats } from "@/lib/queries"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

function TurnStateDot({ state }: { state: ChatSummary["turnState"] }) {
  if (state === null || state === "completed") return null
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        state === "running" && "animate-pulse bg-primary",
        state === "error" && "bg-destructive",
        state === "interrupted" && "bg-muted-foreground"
      )}
      aria-label={`turn ${state}`}
    />
  )
}

export function ChatsPage() {
  const chats = useChats()
  const actions = useChatsActions()
  const navigate = useNavigate()
  const { chatId } = useParams({ strict: false })
  const [sidebarWidth, setSidebarWidth] = useState(
    useUiPrefs().workspaceSidebarWidth
  )

  const remove = async (id: string) => {
    try {
      await actions.remove(id)
      if (id === chatId) void navigate({ to: "/chats" })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "delete failed")
    }
  }

  const summaries = chats.data ?? []

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col border-r"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Threads
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="New thread"
            onClick={() => void navigate({ to: "/chats" })}
          >
            <IconPlus className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No threads yet. Send a message to start one.
            </p>
          ) : (
            summaries.map((c) => (
              <Link
                key={c.id}
                to="/chats/$chatId"
                params={{ chatId: c.id }}
                className={cn(
                  "group/row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60",
                  c.id === chatId && "bg-muted"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <TurnStateDot state={c.turnState} />
                    <span className="truncate text-sm">{c.title}</span>
                  </div>
                  {c.lastMessage !== null && c.lastMessage.length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">
                      {c.lastMessage}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Delete thread"
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void remove(c.id)
                  }}
                >
                  <IconX className="size-3.5" />
                </button>
              </Link>
            ))
          )}
        </div>
      </aside>
      <ResizeHandle
        orientation="col"
        value={sidebarWidth}
        min={180}
        max={() => Math.max(240, window.innerWidth - 480)}
        onResize={setSidebarWidth}
        onResizeEnd={(w) => setUiPrefs({ workspaceSidebarWidth: w })}
        label="Resize sidebar"
      />
      <section className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </section>
    </div>
  )
}
