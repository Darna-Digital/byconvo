/**
 * KanbanPage — a Trello-style board persisted per repo. Cards carry a short
 * stable key (e.g. "T-3") that can be referenced from a terminal thread. Cards
 * are dragged between the fixed columns; the column drop handler moves them.
 */
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useKanbanActions } from "@/features/kanban/adapters/kanban.hook.adapter"
import type { KanbanCard, KanbanColumn } from "@/lib/api/types"
import { useKanban } from "@/lib/queries"
import { cn } from "@/lib/utils"

export function KanbanPage() {
  const kanban = useKanban()
  const board = kanban.data ?? null
  const actions = useKanbanActions(board)
  const [addingTo, setAddingTo] = useState<KanbanColumn | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [dragId, setDragId] = useState<string | null>(null)

  const groups = actions.columns()
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]))

  const addCard = async (column: KanbanColumn) => {
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

  const drop = async (column: KanbanColumn) => {
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

  const editCard = async (card: KanbanCard) => {
    const title = window.prompt("Card title:", card.title)
    if (title === null || title.trim().length === 0) return
    await actions.update(card.id, { title: title.trim() })
  }

  const removeCard = async (id: string) => {
    if (!window.confirm("Delete this card?")) return
    await actions.remove(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center border-b px-4 py-2">
        <span className="text-sm font-medium">Kanban board</span>
        <span className="ml-2 text-xs text-muted-foreground">
          Drag cards between columns · reference a card by its key in a thread
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-auto p-4">
        {groups.map((group) => (
          <div
            key={group.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void drop(group.key)}
            className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">{group.title}</span>
              <Badge variant="secondary">{group.cards.length}</Badge>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
              {group.cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDragId(card.id)}
                  onDragEnd={() => setDragId(null)}
                  onDoubleClick={() => void editCard(card)}
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
      </div>
    </div>
  )
}
