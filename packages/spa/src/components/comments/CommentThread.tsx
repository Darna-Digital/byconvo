/**
 * Shared review-comment UI — the composer, a single comment card, and the
 * thread container that stacks them. Used by both the diff surface (`DiffPane`)
 * and the single-file browse surface (`CodeView`) so inline comments look and
 * behave identically wherever they appear. Styled with the shadcn primitives
 * (Button/Textarea, card/border tokens) like the rest of the app.
 */
import { IconBrandGithub, IconTrash } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { CommentSide, ReviewComment } from "@/lib/api/types"

/** Where a draft (or new) comment is anchored. */
export interface DraftLocation {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
}

export function CommentComposer({
  onCancel,
  onSubmit,
  autoFocus = true,
}: {
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
  autoFocus?: boolean
}) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = async () => {
    if (body.trim().length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(body.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <Textarea
        ref={ref}
        value={body}
        placeholder="Leave a comment…"
        className="min-h-20 text-sm"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit()
          if (e.key === "Escape") onCancel()
        }}
      />
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          <kbd className="rounded-sm border bg-muted px-1 py-0.5 font-mono text-[10px]">⌘↵</kbd> to submit
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={body.trim().length === 0 || busy} onClick={() => void submit()}>
          {busy ? "Saving…" : "Comment"}
        </Button>
      </div>
    </div>
  )
}

export function CommentCard({
  comment,
  onDelete,
  onReply,
}: {
  comment: ReviewComment
  onDelete: (c: ReviewComment) => Promise<void>
  onReply?: (c: ReviewComment, body: string) => Promise<void>
}) {
  const [replying, setReplying] = useState(false)
  const canReply = comment.source === "github" && onReply !== undefined
  return (
    <div className="p-3 text-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author}</span>
        {comment.source === "github" && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5">
            <IconBrandGithub className="size-3" /> GitHub
          </span>
        )}
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          {comment.source === "local" && (
            <button
              type="button"
              className="inline-flex items-center gap-1 transition-colors hover:text-destructive"
              onClick={() => void onDelete(comment)}
            >
              <IconTrash className="size-3" /> Delete
            </button>
          )}
          {canReply && (
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => setReplying((o) => !o)}
            >
              Reply
            </button>
          )}
        </span>
      </div>
      <div className="markdown min-w-0 text-sm">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {comment.body}
        </Markdown>
      </div>
      {replying && onReply !== undefined && (
        <div className="mt-1 border-t">
          <CommentComposer
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              await onReply(comment, body)
              setReplying(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * A stack of comments anchored to one line, rendered as a single shadcn-style
 * card. `children` lets callers append a reply/extra composer below the list.
 */
export function CommentThread({
  comments,
  onDelete,
  onReply,
  children,
}: {
  comments: ReadonlyArray<ReviewComment>
  onDelete: (c: ReviewComment) => Promise<void>
  onReply?: (c: ReviewComment, body: string) => Promise<void>
  children?: React.ReactNode
}) {
  return (
    <div className="my-2 ml-12 mr-3 max-w-2xl min-w-0 divide-y divide-border overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} onDelete={onDelete} onReply={onReply} />
      ))}
      {children}
    </div>
  )
}

/** A standalone draft composer, card-styled to match `CommentThread`. */
export function DraftCard({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
}) {
  return (
    <div className="my-2 ml-12 mr-3 max-w-2xl min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      <CommentComposer onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  )
}
