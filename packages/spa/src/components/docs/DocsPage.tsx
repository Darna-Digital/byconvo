/**
 * DocsPage — markdown plans agents and people read and write. The left rail
 * lists docs (stored as `.md` files under `.byconvo/docs/`); the main pane is a
 * markdown editor with an Edit/Preview toggle and a Save action.
 */
import { IconDeviceFloppy, IconPlus, IconTrash } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"
import { ResizeHandle } from "@/components/layout/ResizeHandle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useDocsActions } from "@/features/docs/adapters/docs.hook.adapter"
import { useDoc, useDocs } from "@/lib/queries"
import { timeAgo } from "@/lib/relative-time"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"

export function DocsPage() {
  const docs = useDocs()
  const actions = useDocsActions()
  const prefs = useUiPrefs()
  const [sidebarWidth, setSidebarWidth] = useState(prefs.workspaceSidebarWidth)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)

  const summaries = useMemo(() => docs.data ?? [], [docs.data])
  useEffect(() => {
    if (summaries.length === 0) {
      setSelectedId(null)
    } else if (!summaries.some((d) => d.id === selectedId)) {
      setSelectedId(summaries[0].id)
    }
  }, [summaries, selectedId])

  const detail = useDoc(selectedId)
  // Load the fetched content into the editable draft once per doc.
  useEffect(() => {
    if (detail.data && detail.data.id !== loadedId) {
      setDraft(detail.data.content)
      setLoadedId(detail.data.id)
    }
  }, [detail.data, loadedId])

  const dirty = detail.data != null && draft !== detail.data.content

  const openNew = () => {
    setNewTitle("")
    setAdding(true)
  }

  const cancelNew = () => {
    setAdding(false)
    setNewTitle("")
  }

  // Create from the inline title field. A native `window.prompt` is unreliable
  // here — it throws in the Electron desktop renderer, so clicking + did nothing.
  const submitNew = async () => {
    const title = newTitle.trim()
    if (title.length === 0 || creating) return
    setCreating(true)
    try {
      const created = await actions.create(title)
      if (created !== null) {
        setSelectedId(created.id)
        setMode("edit")
        cancelNew()
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "could not create doc"
      )
    } finally {
      setCreating(false)
    }
  }

  const save = async () => {
    if (selectedId === null || saving) return
    setSaving(true)
    try {
      await actions.save(selectedId, draft)
      toast.success("Saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "could not save")
    } finally {
      setSaving(false)
    }
  }

  const removeDoc = async (id: string) => {
    if (!window.confirm("Delete this plan?")) return
    await actions.remove(id)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col border-r"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Docs &amp; plans</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="New doc"
            onClick={openNew}
          >
            <IconPlus className="size-4" />
          </Button>
        </div>
        {adding && (
          <div className="px-2 pb-2">
            <Input
              autoFocus
              value={newTitle}
              placeholder="Plan title…"
              disabled={creating}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={() => {
                if (newTitle.trim().length === 0) cancelNew()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void submitNew()
                } else if (e.key === "Escape") {
                  cancelNew()
                }
              }}
              className="h-7"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {summaries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No plans yet. Create one — agents can read and write these
              markdown files directly.
            </p>
          ) : (
            summaries.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  d.id === selectedId && "bg-muted"
                )}
              >
                <span className="truncate font-medium">{d.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {timeAgo(d.updatedAt)}
                </span>
              </button>
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
        {detail.data == null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select or create a plan.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-4 py-2">
              <span className="truncate text-sm font-medium">
                {detail.data.title}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <div className="flex rounded-md border p-0.5">
                  {(["edit", "preview"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded px-2 py-0.5 text-xs capitalize",
                        mode === m
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                >
                  <IconDeviceFloppy className="size-4" />
                  {dirty ? "Save" : "Saved"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Delete doc"
                  onClick={() => void removeDoc(detail.data.id)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto">
              {mode === "edit" ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-full w-full resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0"
                  placeholder="# Plan&#10;&#10;Write the plan in markdown…"
                />
              ) : (
                <div className="markdown mx-auto max-w-3xl p-6 text-sm">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {draft}
                  </Markdown>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
