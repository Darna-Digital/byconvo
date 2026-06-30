/**
 * TasksPage — a Trello-style board persisted per repo. Cards carry a short
 * stable key (e.g. "T-3") that can be referenced from a terminal thread. Cards
 * are dragged between the fixed columns; the column drop handler moves them.
 */
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { agentIcon } from "@/components/threads/agent-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useTasksActions } from "@/features/tasks/adapters/tasks.hook.adapter"
import { useThreadsActions } from "@/features/threads/adapters/threads.hook.adapter"
import { AGENTS } from "@/features/threads/entity/agents"
import type { AgentKind, TasksCard, TasksColumn } from "@/lib/api/types"
import { useRepo, useTasks } from "@/lib/queries"
import { timeAgo } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

/** Agent CLIs that can be @-mentioned in a comment (excludes the plain shell). */
const MENTIONABLE = AGENTS.filter((a) => a.kind !== "terminal")

/** Detect a trailing "@partial" the user is typing, for the mention picker. */
const trailingMention = (value: string): string | null => {
  const m = /(?:^|\s)@(\w*)$/.exec(value)
  return m === null ? null : m[1]
}

/** The first @-mentioned agent in a comment body, if any. */
const mentionedAgent = (body: string): AgentKind | null => {
  for (const a of MENTIONABLE) {
    if (new RegExp(`(?:^|\\s)@${a.kind}\\b`, "i").test(body)) return a.kind
  }
  return null
}

export function TasksPage() {
  const tasks = useTasks()
  const board = tasks.data ?? null
  const actions = useTasksActions(board)
  const threadActions = useThreadsActions()
  const repo = useRepo()
  const navigate = useNavigate()
  const currentBranch = repo.data?.currentBranch ?? ""
  const [addingTo, setAddingTo] = useState<TasksColumn | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [dragId, setDragId] = useState<string | null>(null)
  const [prefix, setPrefix] = useState("")
  // The card open in the detail editor (title + description).
  const [editing, setEditing] = useState<TasksCard | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  // Column (status) management.
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState("")
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null)
  const [columnDraft, setColumnDraft] = useState("")
  // Comments on the open task.
  const [newComment, setNewComment] = useState("")
  const [copiedComment, setCopiedComment] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<{
    id: string
    snippet: string
  } | null>(null)
  // The "@partial" the user is currently typing (drives the mention picker).
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const commentRef = useRef<HTMLInputElement | null>(null)

  // Keep the prefix field in sync with the loaded board.
  useEffect(() => {
    if (board?.prefix != null) setPrefix(board.prefix)
  }, [board?.prefix])

  const commitPrefix = async () => {
    const next = prefix.trim()
    if (next.length === 0 || next === board?.prefix) return
    try {
      await actions.setPrefix(next)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not set prefix"
      )
    }
  }

  const groups = actions.columns()
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]))

  const addCard = async (column: TasksColumn) => {
    try {
      const created = await actions.create(newTitle, column)
      if (created !== null) {
        setNewTitle("")
        setAddingTo(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not add card")
    }
  }

  const drop = async (column: TasksColumn) => {
    const card = dragId === null ? undefined : byId.get(dragId)
    setDragId(null)
    if (card === undefined) return
    try {
      await actions.move(card, column)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not move card"
      )
    }
  }

  const openCard = (card: TasksCard) => {
    setEditing(card)
    setEditTitle(card.title)
    setEditDescription(card.description)
  }

  const saveCard = async () => {
    if (editing === null) return
    const title = editTitle.trim()
    if (title.length === 0) return
    try {
      await actions.update(editing.id, {
        title,
        description: editDescription,
      })
      setEditing(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not update task"
      )
    }
  }

  // The live version of the open card (board refetches after a comment change,
  // so the dialog must read fresh comments, not the snapshot taken on open).
  const editingLive =
    editing === null
      ? null
      : (board?.cards.find((c) => c.id === editing.id) ?? editing)

  const onCommentChange = (value: string) => {
    setNewComment(value)
    setMentionQuery(trailingMention(value))
  }

  // Replace the "@partial" being typed with a full "@agent " mention.
  const insertMention = (kind: AgentKind) => {
    setNewComment((v) =>
      v.replace(/(^|\s)@\w*$/, (_m, p: string) => `${p}@${kind} `)
    )
    setMentionQuery(null)
    commentRef.current?.focus()
  }

  const startReply = (commentId: string, body: string) => {
    setReplyTo({ id: commentId, snippet: body.slice(0, 48) })
    commentRef.current?.focus()
  }

  const addComment = async () => {
    if (editingLive === null) return
    const card = editingLive
    const body = newComment.trim()
    if (body.length === 0) return
    const parentId = replyTo?.id ?? null
    const agent = mentionedAgent(body)
    try {
      await actions.addComment(card.id, body, parentId)
      setNewComment("")
      setReplyTo(null)
      setMentionQuery(null)
      // Tagging an agent spins up a terminal thread seeded with the task + the
      // comment, then jumps to it.
      if (agent !== null) {
        const instruction = body
          .replace(new RegExp(`(?:^|\\s)@${agent}\\b`, "i"), "")
          .trim()
        const initialPrompt = [
          `You are working on task ${card.key}: ${card.title}.`,
          card.description.trim().length > 0
            ? `\n\n${card.description.trim()}`
            : "",
          `\n\nAddress this comment:\n${instruction.length > 0 ? instruction : body}`,
        ].join("")
        await threadActions.spawnForTask({
          agent,
          branch: currentBranch,
          taskKey: card.key,
          title: `${card.key} · ${instruction.slice(0, 40) || card.title}`,
          initialPrompt,
        })
        toast.success(`Started ${agent} on ${card.key}`)
        setEditing(null)
        void navigate({ to: "/threads" })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not add comment"
      )
    }
  }

  const removeComment = async (commentId: string) => {
    if (editing === null) return
    try {
      await actions.removeComment(editing.id, commentId)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not delete comment"
      )
    }
  }

  // Copy a self-contained, agent-ready instruction with a resolvable link. The
  // agent runs with $BYCONVO_API set, so it can fetch the comment + task context.
  const copyCommentLink = async (
    card: TasksCard,
    comment: { id: string; body: string }
  ) => {
    const text = `Work on task ${card.key} (${card.title}): "${comment.body}". Full context: $BYCONVO_API/api/tasks/comments/${comment.id}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedComment(comment.id)
      setTimeout(
        () => setCopiedComment((c) => (c === comment.id ? null : c)),
        1500
      )
    } catch {
      toast.error("could not copy to clipboard")
    }
  }

  const orderedColumnIds = (): string[] =>
    (board?.columns ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)

  const addColumn = async () => {
    const name = newColumnName.trim()
    if (name.length === 0) return
    try {
      await actions.addColumn(name)
      setNewColumnName("")
      setAddingColumn(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not add column"
      )
    }
  }

  const commitColumnRename = async () => {
    if (renamingColumn === null) return
    const id = renamingColumn
    const name = columnDraft.trim()
    setRenamingColumn(null)
    if (name.length === 0) return
    try {
      await actions.renameColumn(id, name)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not rename column"
      )
    }
  }

  const deleteColumn = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete the "${name}" column? Its tasks move to the first column.`
      )
    )
      return
    try {
      await actions.removeColumn(id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not delete column"
      )
    }
  }

  const moveColumn = async (id: string, dir: -1 | 1) => {
    const ids = orderedColumnIds()
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    try {
      await actions.reorderColumns(ids)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not move column"
      )
    }
  }

  const removeCard = async (id: string) => {
    if (!window.confirm("Delete this card?")) return
    try {
      await actions.remove(id)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not delete card"
      )
    }
  }

  const renderComment = (
    c: TasksCard["comments"][number],
    isReply: boolean
  ) => (
    <li
      key={c.id}
      className={cn(
        "rounded-md border bg-muted/30 p-2 text-sm",
        isReply && "ml-4"
      )}
    >
      <p className="break-words whitespace-pre-wrap">{c.body}</p>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{timeAgo(c.createdAt)}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => startReply(c.id, c.body)}
        >
          <IconArrowBackUp className="size-3.5" /> Reply
        </button>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => editingLive && void copyCommentLink(editingLive, c)}
        >
          {copiedComment === c.id ? (
            <>
              <IconCheck className="size-3.5" /> Copied
            </>
          ) : (
            <>
              <IconCopy className="size-3.5" /> Copy link
            </>
          )}
        </button>
        <button
          type="button"
          aria-label="Delete comment"
          className="hover:text-destructive"
          onClick={() => void removeComment(c.id)}
        >
          <IconTrash className="size-3.5" />
        </button>
      </div>
    </li>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">Tasks board</span>
        <span className="text-xs text-muted-foreground">
          Reference a task by its key (e.g. {board?.prefix ?? "T"}-1) in a
          thread, or have an agent resolve it via{" "}
          <code className="rounded bg-muted px-1">
            GET /api/tasks/&#123;ref&#125;
          </code>
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Key prefix
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onBlur={() => void commitPrefix()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            aria-label="Task key prefix"
            className="h-7 w-20 font-mono uppercase"
          />
        </label>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-4">
        {groups.map((group) => (
          <div
            key={group.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void drop(group.key)}
            className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
          >
            <div className="flex items-center gap-1 px-3 py-2">
              {renamingColumn === group.key ? (
                <Input
                  autoFocus
                  value={columnDraft}
                  className="h-6 flex-1"
                  onChange={(e) => setColumnDraft(e.target.value)}
                  onBlur={() => void commitColumnRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void commitColumnRename()
                    } else if (e.key === "Escape") setRenamingColumn(null)
                  }}
                />
              ) : (
                <>
                  <span
                    className="flex-1 truncate text-sm font-medium"
                    onDoubleClick={() => {
                      setRenamingColumn(group.key)
                      setColumnDraft(group.title)
                    }}
                    title="Double-click to rename"
                  >
                    {group.title}
                  </span>
                  <Badge variant="secondary">{group.cards.length}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label="Column options"
                        >
                          <IconDots className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingColumn(group.key)
                          setColumnDraft(group.title)
                        }}
                      >
                        <IconPencil className="size-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void moveColumn(group.key, -1)}
                      >
                        <IconChevronLeft className="size-4" /> Move left
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void moveColumn(group.key, 1)}
                      >
                        <IconChevronRight className="size-4" /> Move right
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          void deleteColumn(group.key, group.title)
                        }
                      >
                        <IconTrash className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
              {group.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDragId(card.id)}
                  onDragEnd={() => setDragId(null)}
                  onDoubleClick={() => openCard(card)}
                  className={cn(
                    "group/card cursor-grab rounded-md border bg-background p-2 shadow-xs active:cursor-grabbing",
                    dragId === card.id && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {card.key}
                    </Badge>
                    <span className="min-w-0 flex-1 text-sm">{card.title}</span>
                    <button
                      type="button"
                      aria-label="Delete card"
                      onClick={() => void removeCard(card.id)}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-destructive"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  </div>
                  {card.description.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {card.description}
                    </p>
                  )}
                </div>
              ))}

              {addingTo === group.key ? (
                <div className="flex flex-col gap-1.5 rounded-md border bg-background p-2">
                  <Input
                    autoFocus
                    value={newTitle}
                    placeholder="Card title…"
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void addCard(group.key)
                      } else if (e.key === "Escape") {
                        setAddingTo(null)
                        setNewTitle("")
                      }
                    }}
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={newTitle.trim().length === 0}
                      onClick={() => void addCard(group.key)}
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddingTo(null)
                        setNewTitle("")
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-muted-foreground"
                  onClick={() => {
                    setAddingTo(group.key)
                    setNewTitle("")
                  }}
                >
                  <IconPlus className="size-4" /> Add card
                </Button>
              )}
            </div>
          </div>
        ))}

        {addingColumn ? (
          <div className="flex w-72 shrink-0 flex-col gap-1.5 self-start rounded-lg border bg-muted/30 p-2">
            <Input
              autoFocus
              value={newColumnName}
              placeholder="Column name…"
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void addColumn()
                } else if (e.key === "Escape") {
                  setAddingColumn(false)
                  setNewColumnName("")
                }
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                disabled={newColumnName.trim().length === 0}
                onClick={() => void addColumn()}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingColumn(false)
                  setNewColumnName("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="h-9 w-44 shrink-0 justify-start self-start text-muted-foreground"
            onClick={() => {
              setAddingColumn(true)
              setNewColumnName("")
            }}
          >
            <IconPlus className="size-4" /> Add column
          </Button>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing !== null && (
                <Badge variant="outline">{editing.key}</Badge>
              )}
              Task details
            </DialogTitle>
            <DialogDescription className="sr-only">
              Edit the task title and description.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              value={editTitle}
              placeholder="Title"
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void saveCard()
                }
              }}
            />
            <Textarea
              value={editDescription}
              placeholder="Description — context an agent can read when working on this task…"
              className="min-h-32 resize-none"
              onChange={(e) => setEditDescription(e.target.value)}
            />

            {/* Comments — reply, or @-mention an agent (e.g. @claude) to spin
                up a thread seeded with this task + comment. */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                Comments
              </div>
              {editingLive !== null && editingLive.comments.length > 0 ? (
                <ul className="flex max-h-56 flex-col gap-2 overflow-auto">
                  {editingLive.comments
                    .filter((c) => c.parentId === null)
                    .flatMap((top) => [
                      top,
                      ...editingLive.comments.filter(
                        (c) => c.parentId === top.id
                      ),
                    ])
                    .map((c) => renderComment(c, c.parentId !== null))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No comments yet. Reply or @-mention an agent (e.g. @claude) to
                  put it to work.
                </p>
              )}

              {replyTo !== null && (
                <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  <IconArrowBackUp className="size-3.5 shrink-0" />
                  <span className="truncate">
                    Replying to “{replyTo.snippet}”
                  </span>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    className="ml-auto hover:text-foreground"
                    onClick={() => setReplyTo(null)}
                  >
                    <IconX className="size-3.5" />
                  </button>
                </div>
              )}

              <div className="relative flex gap-1.5">
                {/* @-mention picker — shown while typing "@agent". */}
                {mentionQuery !== null && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                    {MENTIONABLE.filter((a) =>
                      a.kind.startsWith(mentionQuery.toLowerCase())
                    ).map((a) => {
                      const Icon = agentIcon(a.kind)
                      return (
                        <button
                          key={a.kind}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => insertMention(a.kind)}
                        >
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium">@{a.kind}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {a.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                <Input
                  ref={commentRef}
                  value={newComment}
                  placeholder={
                    replyTo !== null
                      ? "Write a reply… (@agent to assign)"
                      : "Comment… (@agent to assign)"
                  }
                  onChange={(e) => onCommentChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void addComment()
                    } else if (e.key === "Escape" && mentionQuery !== null) {
                      e.preventDefault()
                      setMentionQuery(null)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={newComment.trim().length === 0}
                  onClick={() => void addComment()}
                >
                  {mentionedAgent(newComment) !== null
                    ? "Send"
                    : replyTo !== null
                      ? "Reply"
                      : "Add"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              disabled={editTitle.trim().length === 0}
              onClick={() => void saveCard()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
