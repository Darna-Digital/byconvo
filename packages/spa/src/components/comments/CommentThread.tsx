/**
 * Shared review-comment UI — the composer, a single comment card, and the
 * thread container that stacks them. Used by both the diff surface (`DiffPane`)
 * and the single-file browse surface (`CodeView`) so inline comments look and
 * behave identically wherever they appear.
 *
 * Visually modelled on the Pierre / diffs.com comment threads: a soft rounded
 * card, round author avatars, name + relative timestamp, replies nested under
 * the opening comment, and a blue "Add reply… / Resolve" action row. Built on
 * the shadcn primitives and theme tokens so it adapts to light & dark.
 */
import { IconBrandGithub, IconCornerDownRight } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { AuthorAvatar } from "@/components/comments/AuthorAvatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { timeAgo } from "@/lib/relative-time"
import type { CommentSide, ReviewComment } from "@/lib/api/types"

/** Where a draft (or new) comment is anchored. */
export interface DraftLocation {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
}

/** Indent (avatar + gap) used to nest replies under the opening comment. */
const REPLY_INDENT = "ml-10"

export function CommentComposer({
  onCancel,
  onSubmit,
  autoFocus = true,
  submitLabel = "Comment",
  placeholder = "Leave a comment…",
}: {
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
  autoFocus?: boolean
  submitLabel?: string
  placeholder?: string
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
    <div className="flex flex-col gap-2">
      <Textarea
        ref={ref}
        value={body}
        placeholder={placeholder}
        className="min-h-20 resize-none bg-background text-sm"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit()
          if (e.key === "Escape") onCancel()
        }}
      />
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          <kbd className="rounded-sm border bg-muted px-1 py-0.5 font-mono text-[10px]">
            ⌘↵
          </kbd>{" "}
          to submit
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={body.trim().length === 0 || busy}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  )
}

function CommentCard({ comment }: { comment: ReviewComment }) {
  return (
    <div className="flex gap-3">
      <AuthorAvatar author={comment.author} source={comment.source} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            {comment.author}
          </span>
          {comment.source === "github" && (
            <IconBrandGithub
              className="size-3.5 text-muted-foreground"
              aria-label="GitHub"
            />
          )}
          <span className="text-xs text-muted-foreground">
            {timeAgo(comment.createdAt)}
          </span>
        </div>
        <div className="markdown mt-0.5 min-w-0 text-sm">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {comment.body}
          </Markdown>
        </div>
      </div>
    </div>
  )
}

/** A blue, link-styled thread action (Add reply… / Resolve). */
function ThreadAction({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {icon}
      {children}
    </button>
  )
}

/**
 * A stack of comments anchored to one line, rendered as a single rounded card.
 * The opening comment sits flush; later comments are nested as replies. The
 * footer offers "Add reply…" (GitHub threads) and "Resolve" (removes the local
 * comments — deletion is how a local thread is resolved).
 */
export function CommentThread({
  comments,
  onDelete,
  onReply,
}: {
  comments: ReadonlyArray<ReviewComment>
  onDelete: (c: ReviewComment) => Promise<void>
  onReply?: (c: ReviewComment, body: string) => Promise<void>
}) {
  const [replying, setReplying] = useState(false)
  const [resolving, setResolving] = useState(false)

  const lastGithub = [...comments].reverse().find((c) => c.source === "github")
  const localComments = comments.filter((c) => c.source === "local")
  const canReply = onReply !== undefined && lastGithub !== undefined
  const canResolve = localComments.length > 0

  const resolve = async () => {
    if (resolving) return
    setResolving(true)
    try {
      await Promise.all(localComments.map((c) => onDelete(c)))
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="my-2 mr-3 ml-12 max-w-2xl min-w-0 overflow-hidden rounded-xl border bg-card p-4 font-sans text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4">
        {comments.map((comment, i) => (
          <div key={comment.id} className={i === 0 ? undefined : REPLY_INDENT}>
            <CommentCard comment={comment} />
          </div>
        ))}
      </div>

      <div className={`mt-3 ${REPLY_INDENT}`}>
        {replying && onReply !== undefined && lastGithub !== undefined ? (
          <CommentComposer
            submitLabel="Reply"
            placeholder="Reply…"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              await onReply(lastGithub, body)
              setReplying(false)
            }}
          />
        ) : (
          (canReply || canResolve) && (
            <div className="flex items-center gap-4">
              {canReply && (
                <ThreadAction
                  onClick={() => setReplying(true)}
                  icon={<IconCornerDownRight className="size-4" />}
                >
                  Add reply…
                </ThreadAction>
              )}
              {canResolve && (
                <ThreadAction onClick={() => void resolve()}>
                  {resolving ? "Resolving…" : "Resolve"}
                </ThreadAction>
              )}
            </div>
          )
        )}
      </div>
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
    <div className="my-2 mr-3 ml-12 max-w-2xl min-w-0 overflow-hidden rounded-xl border bg-card p-4 font-sans text-card-foreground shadow-sm">
      <CommentComposer onCancel={onCancel} onSubmit={onSubmit} />
    </div>
  )
}
