/**
 * Manage the user's saved commit-message prefixes (e.g. "feat:", "DAR-144:").
 * These are stored globally on the machine and steer the AI commit-message
 * generation. A small settings button opens this dialog from the commit panel.
 */
import {
  IconPencil,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { fetchClient } from "@/lib/api/client"
import type { CommitPrefix } from "@/lib/api/types"
import { useCommitPrefixes } from "@/lib/queries"

const PREFIXES_KEY = ["get", "/api/git-message/prefixes"] as const

const errorText = (error: unknown): string =>
  (error as { message?: string; reason?: string })?.message ??
  (error as { reason?: string })?.reason ??
  "request failed"

export function CommitPrefixDialog() {
  const { data: prefixes = [] } = useCommitPrefixes()
  const queryClient = useQueryClient()

  const [value, setValue] = useState("")
  const [description, setDescription] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEditingId(null)
    setValue("")
    setDescription("")
  }

  const run = async (p: Promise<{ error?: unknown }>) => {
    setBusy(true)
    try {
      const { error } = await p
      if (error) throw new Error(errorText(error))
      await queryClient.invalidateQueries({ queryKey: PREFIXES_KEY })
      return true
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const v = value.trim()
    if (v.length === 0) return
    const body = { value: v, description: description.trim() || undefined }
    const ok = await run(
      editingId === null
        ? fetchClient.POST("/api/git-message/prefixes", { body })
        : fetchClient.PUT("/api/git-message/prefixes/{id}", {
            params: { path: { id: editingId } },
            body,
          })
    )
    if (ok) reset()
  }

  const startEdit = (prefix: CommitPrefix) => {
    setEditingId(prefix.id)
    setValue(prefix.value)
    setDescription(prefix.description ?? "")
  }

  const remove = async (id: string) => {
    const ok = await run(
      fetchClient.DELETE("/api/git-message/prefixes/{id}", {
        params: { path: { id } },
      })
    )
    if (ok && editingId === id) reset()
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            title="Manage commit prefixes"
          />
        }
      >
        <IconSettings className="size-3.5" />
        Prefixes
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit prefixes</DialogTitle>
          <DialogDescription>
            Saved prefixes are stored on this machine and guide the generated
            commit message. The model uses the best-fitting one verbatim.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-60 flex-col gap-1 overflow-auto">
          {prefixes.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No prefixes yet. Add one below.
            </p>
          ) : (
            prefixes.map((prefix) => (
              <div
                key={prefix.id}
                className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted"
              >
                <span className="font-mono font-medium">{prefix.value}</span>
                {prefix.description !== null && (
                  <span className="truncate text-xs text-muted-foreground">
                    {prefix.description}
                  </span>
                )}
                <div className="ml-auto flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    title="Edit"
                    onClick={() => startEdit(prefix)}
                  >
                    <IconPencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    title="Delete"
                    onClick={() => void remove(prefix.id)}
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="flex gap-2">
            <Input
              value={value}
              placeholder="feat:"
              className="font-mono"
              onChange={(e) => setValue(e.target.value)}
            />
            <Input
              value={description}
              placeholder="Description (optional)"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            {editingId !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={reset}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={busy || value.trim().length === 0}
            >
              {editingId === null ? (
                <>
                  <IconPlus className="size-3.5" /> Add
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
