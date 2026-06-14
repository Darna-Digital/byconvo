import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { IconBrandGithub, IconTrash } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DiffConnectors, connectorGutterCSS } from "@/components/diff/DiffConnectors"
import type { CommentSide, DiffTarget, ReviewComment } from "@/lib/api/types"
import type { DiffStyle, Theme } from "@/lib/ui-prefs"

export interface DraftLocation {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
}

type AnnotationMeta =
  | { readonly kind: "comments"; readonly comments: ReadonlyArray<ReviewComment> }
  | { readonly kind: "draft" }

interface DiffPaneProps {
  files: ReadonlyArray<FileDiffMetadata>
  theme: Theme
  diffStyle: DiffStyle
  connectors: boolean
  loading: boolean
  error: string | null
  target: DiffTarget
  comments: ReadonlyArray<ReviewComment>
  draft: DraftLocation | null
  selectedFile: string | null
  onDraftOpen: (draft: DraftLocation) => void
  onDraftCancel: () => void
  onEditFile: (path: string) => void
  onCommentSubmit: (location: DraftLocation, body: string) => Promise<void>
  onCommentDelete: (comment: ReviewComment) => Promise<void>
  onCommentReply: (comment: ReviewComment, body: string) => Promise<void>
}

const emptyHint = (target: DiffTarget): string => {
  switch (target.kind) {
    case "worktree":
      return "Working tree is clean — make some changes and hit refresh."
    case "range":
      return "These refs are identical."
    case "commit":
      return "This commit has no textual changes."
    case "pull":
      return "This pull request has no diff."
  }
}

const THEMES = { light: "github-light", dark: "github-dark" } as const

function Composer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
}) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => ref.current?.focus(), [])

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
      <div className="flex justify-end gap-2">
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

function CommentCard({
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
    <div className="border-t p-3 text-sm first:border-t-0">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author}</span>
        {comment.source === "github" && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5">
            <IconBrandGithub className="size-3" /> GitHub
          </span>
        )}
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        <span className="ml-auto flex gap-1">
          {comment.source === "local" && (
            <button
              className="inline-flex items-center gap-1 hover:text-destructive"
              onClick={() => void onDelete(comment)}
            >
              <IconTrash className="size-3" /> Delete
            </button>
          )}
          {canReply && (
            <button className="hover:text-foreground" onClick={() => setReplying((o) => !o)}>
              Reply
            </button>
          )}
        </span>
      </div>
      <div className="markdown text-sm">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {comment.body}
        </Markdown>
      </div>
      {replying && onReply !== undefined && (
        <Composer
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            await onReply(comment, body)
            setReplying(false)
          }}
        />
      )}
    </div>
  )
}

interface FileDiffSectionProps {
  file: FileDiffMetadata
  theme: Theme
  diffStyle: DiffStyle
  connectorsEnabled: boolean
  annotations: ReadonlyArray<DiffLineAnnotation<AnnotationMeta>>
  onDraftOpen: (draft: DraftLocation) => void
  onDraftCancel: () => void
  onEditFile: (path: string) => void
  onCommentSubmit: (location: DraftLocation, body: string) => Promise<void>
  onCommentDelete: (comment: ReviewComment) => Promise<void>
  onCommentReply: (comment: ReviewComment, body: string) => Promise<void>
}

function FileDiffSection({
  file,
  theme,
  diffStyle,
  connectorsEnabled,
  annotations,
  onDraftOpen,
  onDraftCancel,
  onEditFile,
  onCommentSubmit,
  onCommentDelete,
  onCommentReply,
}: FileDiffSectionProps) {
  // Callback-ref state (not a ref object): DiffConnectors reads the section in a
  // layout effect, which fires bottom-up, so a child would see a parent ref as
  // null. The setter only fires on mount.
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null)
  const recomputeConnectors = useRef<() => void>(() => {})
  const onPostRender = useCallback(() => recomputeConnectors.current(), [])

  return (
    <section ref={setSectionEl} className="diff-file relative border-b" data-file-anchor={file.name}>
      <FileDiff<AnnotationMeta>
        fileDiff={file}
        disableWorkerPool
        options={{
          theme: THEMES,
          themeType: theme,
          diffStyle,
          lineDiffType: "word",
          overflow: diffStyle === "split" ? "scroll" : "wrap",
          stickyHeader: false,
          enableLineSelection: true,
          unsafeCSS: connectorsEnabled ? connectorGutterCSS : undefined,
          onPostRender: connectorsEnabled ? onPostRender : undefined,
          onLineNumberClick: (props) =>
            onDraftOpen({ filePath: file.name, side: props.annotationSide, lineNumber: props.lineNumber }),
        }}
        renderHeaderMetadata={(meta) =>
          meta.type === "deleted" ? null : (
            <Button variant="ghost" size="xs" onClick={() => onEditFile(meta.name)}>
              Edit
            </Button>
          )
        }
        lineAnnotations={annotations as Array<DiffLineAnnotation<AnnotationMeta>>}
        renderAnnotation={(annotation) => {
          const meta = annotation.metadata
          if (meta.kind === "draft") {
            return (
              <div className="border-y bg-muted/30">
                <Composer
                  onCancel={onDraftCancel}
                  onSubmit={(body) =>
                    onCommentSubmit(
                      { filePath: file.name, side: annotation.side, lineNumber: annotation.lineNumber },
                      body,
                    )
                  }
                />
              </div>
            )
          }
          return (
            <div className="border-y bg-muted/30">
              {meta.comments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onDelete={onCommentDelete}
                  onReply={onCommentReply}
                />
              ))}
            </div>
          )
        }}
      />
      <DiffConnectors section={sectionEl} recomputeRef={recomputeConnectors} enabled={connectorsEnabled} />
    </section>
  )
}

export function DiffPane({
  files,
  theme,
  diffStyle,
  connectors,
  loading,
  error,
  target,
  comments,
  draft,
  selectedFile,
  onDraftOpen,
  onDraftCancel,
  onEditFile,
  onCommentSubmit,
  onCommentDelete,
  onCommentReply,
}: DiffPaneProps) {
  const connectorsEnabled = connectors && diffStyle === "split"
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedFile === null) return
    const anchor = containerRef.current?.querySelector(`[data-file-anchor="${CSS.escape(selectedFile)}"]`)
    anchor?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [selectedFile])

  const annotationsByFile = useMemo(() => {
    const result = new Map<string, Array<DiffLineAnnotation<AnnotationMeta>>>()
    const grouped = new Map<string, { filePath: string; side: CommentSide; lineNumber: number; comments: ReviewComment[] }>()
    for (const c of comments) {
      const key = `${c.side}:${c.lineNumber}:${c.filePath}`
      const bucket = grouped.get(key)
      if (bucket) bucket.comments.push(c)
      else grouped.set(key, { filePath: c.filePath, side: c.side, lineNumber: c.lineNumber, comments: [c] })
    }
    for (const g of grouped.values()) {
      const arr = result.get(g.filePath) ?? []
      arr.push({ side: g.side, lineNumber: g.lineNumber, metadata: { kind: "comments", comments: g.comments } })
      result.set(g.filePath, arr)
    }
    if (draft !== null) {
      const arr = result.get(draft.filePath) ?? []
      arr.push({ side: draft.side, lineNumber: draft.lineNumber, metadata: { kind: "draft" } })
      result.set(draft.filePath, arr)
    }
    return result
  }, [comments, draft])

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading diff…</div>
  }
  if (error !== null) {
    return <div className="p-8 text-sm text-destructive">{error}</div>
  }
  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-sm">
        <div className="font-medium">Nothing to review</div>
        <div className="text-muted-foreground">{emptyHint(target)}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="diff-pane h-full overflow-auto">
      {files.map((file) => (
        <FileDiffSection
          key={`${target.kind}-${file.prevName ?? ""}-${file.name}`}
          file={file}
          theme={theme}
          diffStyle={diffStyle}
          connectorsEnabled={connectorsEnabled}
          annotations={annotationsByFile.get(file.name) ?? []}
          onDraftOpen={onDraftOpen}
          onDraftCancel={onDraftCancel}
          onEditFile={onEditFile}
          onCommentSubmit={onCommentSubmit}
          onCommentDelete={onCommentDelete}
          onCommentReply={onCommentReply}
        />
      ))}
    </div>
  )
}
