/**
 * ChatsPage — ACP chats. A sidebar on the left lists every repo-scoped chat
 * (grouped by branch, like terminal threads); the panel on the right shows the
 * selected chat's streaming transcript with a toolbar (title + rename, branch,
 * task link). A new chat is just a "+"; the agent and model are chosen inside
 * the chat (see ChatView). Each chat is a structured conversation with a coding
 * agent (Claude Code / Codex / opencode) over ACP.
 */
import { IconGitBranch, IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ChatView } from "@/components/chats/ChatView"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { agentIcon } from "@/components/threads/agent-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useChatsActions } from "@/features/chats/adapters/chats.hook.adapter"
import { chatAgentLabel } from "@/features/chats/entity/agents"
import type { ChatSummary } from "@/lib/api/types"
import { useBranches, useChats, useRepo, useTasks } from "@/lib/queries"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

const NO_TASK = "__none__"
const ALL_BRANCHES = "__all__"

const branchLabel = (branch: string) =>
  branch.length > 0 ? branch : "No branch"

export function ChatsPage() {
  const chats = useChats()
  const actions = useChatsActions()
  const tasks = useTasks()
  const prefs = useUiPrefs()

  const repo = useRepo()
  const branchesQuery = useBranches()

  const summaries = useMemo(() => chats.data ?? [], [chats.data])
  const cards = tasks.data?.cards ?? []
  const currentBranch = repo.data?.currentBranch ?? ""
  const localBranches = useMemo(
    () => (branchesQuery.data ?? []).map((b) => b.name),
    [branchesQuery.data]
  )

  const [sidebarWidth, setSidebarWidth] = useState(prefs.workspaceSidebarWidth)
  const [branchFilter, setBranchFilter] = useState<string | null>(null)
  const activeBranch = branchFilter ?? (currentBranch || ALL_BRANCHES)
  const newChatBranch =
    activeBranch === ALL_BRANCHES ? currentBranch : activeBranch

  const filterBranches = useMemo(() => {
    const set = new Set<string>()
    if (currentBranch) set.add(currentBranch)
    localBranches.forEach((b) => set.add(b))
    summaries.forEach((c) => c.branch && set.add(c.branch))
    return [...set].sort((a, b) =>
      a === currentBranch ? -1 : b === currentBranch ? 1 : a.localeCompare(b)
    )
  }, [currentBranch, localBranches, summaries])

  const groups = useMemo(() => {
    const present = [...new Set(summaries.map((c) => c.branch))].sort((a, b) =>
      a === currentBranch ? -1 : b === currentBranch ? 1 : a.localeCompare(b)
    )
    const branchesToShow =
      activeBranch === ALL_BRANCHES ? present : [activeBranch]
    return branchesToShow.map((branch) => ({
      branch,
      chats: summaries.filter((c) => c.branch === branch),
    }))
  }, [summaries, activeBranch, currentBranch])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{
    id: string
    draft: string
  } | null>(null)

  useEffect(() => {
    if (summaries.length === 0) setActiveId(null)
    else if (!summaries.some((c) => c.id === activeId))
      setActiveId(summaries[0].id)
  }, [summaries, activeId])

  const active = summaries.find((c) => c.id === activeId) ?? null
  const ActiveIcon = agentIcon(active?.agent ?? "claude")

  // A new chat is just a "+": it starts with the last-used agent, and the agent
  // and model are chosen inside the chat (see ChatView).
  const createChat = async () => {
    try {
      const created = await actions.create(
        prefs.lastChatAgent,
        "",
        null,
        newChatBranch
      )
      setActiveId(created.id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not create chat"
      )
    }
  }

  const closeChat = async (id: string) => {
    if (activeId === id) {
      const next = summaries.find((c) => c.id !== id)
      setActiveId(next?.id ?? null)
    }
    await actions.remove(id)
  }

  const commitRename = async () => {
    if (renaming === null) return
    const { id, draft } = renaming
    setRenaming(null)
    if (draft.trim().length > 0) await actions.rename(id, draft)
  }

  const linkTask = (id: string, title: string, key: string) =>
    actions.linkTask(id, title, key === NO_TASK ? null : key)

  const subtitleOf = (c: ChatSummary) =>
    c.lastMessage ?? chatAgentLabel(c.agent)

  const renderRow = (c: ChatSummary) => {
    const Icon = agentIcon(c.agent)
    return (
      <div
        key={c.id}
        className={cn(
          "group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
          c.id === activeId && "bg-muted"
        )}
        onClick={() => setActiveId(c.id)}
        onDoubleClick={() => setRenaming({ id: c.id, draft: c.title })}
        title="Double-click to rename"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {renaming?.id === c.id ? (
          <Input
            autoFocus
            value={renaming.draft}
            className="h-6 flex-1"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenaming({ id: c.id, draft: e.target.value })}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commitRename()
              } else if (e.key === "Escape") setRenaming(null)
            }}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{c.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {subtitleOf(c)}
            </div>
          </div>
        )}
        {c.taskKey !== null && (
          <span className="shrink-0 rounded bg-muted-foreground/15 px-1 text-[10px] text-muted-foreground">
            {c.taskKey}
          </span>
        )}
        <button
          type="button"
          aria-label="Delete chat"
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            void closeChat(c.id)
          }}
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col border-r"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-1.5 px-2 py-2">
          <Select
            value={activeBranch}
            onValueChange={(v) => setBranchFilter(v)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 min-w-0 flex-1 gap-1.5"
              aria-label="Filter chats by branch"
            >
              <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {activeBranch === ALL_BRANCHES
                  ? "All branches"
                  : branchLabel(activeBranch)}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
              {filterBranches.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="New chat"
            onClick={() => void createChat()}
          >
            <IconPlus className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No chats yet. Start one from the + menu.
            </p>
          ) : groups.every((g) => g.chats.length === 0) ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No chats in {branchLabel(activeBranch)} yet. Start one from the +
              menu.
            </p>
          ) : activeBranch === ALL_BRANCHES ? (
            groups
              .filter((g) => g.chats.length > 0)
              .map((group) => (
                <div key={group.branch} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <IconGitBranch className="size-3 shrink-0" />
                    <span className="truncate">
                      {branchLabel(group.branch)}
                    </span>
                    <span className="ml-auto tabular-nums">
                      {group.chats.length}
                    </span>
                  </div>
                  {group.chats.map(renderRow)}
                </div>
              ))
          ) : (
            groups[0]?.chats.map(renderRow)
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
        {active === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <div className="font-medium">No chat open</div>
            <div className="text-muted-foreground">
              Start a chat with Claude Code, Codex, or opencode.
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => void createChat()}
            >
              <IconPlus className="size-4" /> New chat
            </Button>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-1.5">
              <ActiveIcon className="size-4 shrink-0 text-muted-foreground" />
              {renaming?.id === active.id ? (
                <Input
                  autoFocus
                  value={renaming.draft}
                  className="h-7 max-w-64"
                  onChange={(e) =>
                    setRenaming({ id: active.id, draft: e.target.value })
                  }
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void commitRename()
                    } else if (e.key === "Escape") setRenaming(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="group/title flex min-w-0 items-center gap-1.5"
                  onClick={() =>
                    setRenaming({ id: active.id, draft: active.title })
                  }
                >
                  <span className="truncate text-sm font-medium">
                    {active.title}
                  </span>
                  <IconPencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/title:opacity-100" />
                </button>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <Select
                  value={active.branch}
                  onValueChange={(v) =>
                    void actions.setBranch(active.id, active.title, v ?? "")
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto max-w-44 min-w-24 gap-1.5"
                    aria-label="Chat branch"
                  >
                    <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {branchLabel(active.branch)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {filterBranches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={active.taskKey ?? NO_TASK}
                  onValueChange={(v) =>
                    void linkTask(active.id, active.title, v ?? NO_TASK)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto max-w-52 min-w-28"
                  >
                    <span className="truncate">
                      {active.taskKey ?? "Link task"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TASK}>No task</SelectItem>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.key}>
                        {c.key} · {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="New chat"
                  onClick={() => void createChat()}
                >
                  <IconPlus className="size-4" />
                </Button>
              </div>
            </header>

            <ChatView key={active.id} chat={active} />
          </>
        )}
      </section>
    </div>
  )
}
