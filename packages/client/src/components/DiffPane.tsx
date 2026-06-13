import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import type { CommentSide, DiffTarget, ReviewComment } from "../types"
import { connectorGutterCSS, DiffConnectors } from "./DiffConnectors"

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
  theme: "light" | "dark"
  diffStyle: "split" | "unified"
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

function Composer({
  onCancel,
  onSubmit
}: {
  onCancel: () => void
  onSubmit: (body: string) => Promise<void>
}) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

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
    <div className="composer">
      <textarea
        ref={textareaRef}
        value={body}
        placeholder="Leave a comment…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit()
          if (event.key === "Escape") onCancel()
        }}
      />
      {error !== null && <div className="diff-error">{error}</div>}
      <div className="actions">
        <button type="button" className="cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="submit"
          disabled={body.trim().length === 0 || busy}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Comment"}
        </button>
      </div>
    </div>
  )
}

function CommentCard({
  comment,
  onDelete,
  onReply
}: {
  comment: ReviewComment
  onDelete: (comment: ReviewComment) => Promise<void>
  onReply?: (comment: ReviewComment, body: string) => Promise<void>
}) {
  const [replying, setReplying] = useState(false)
  const canReply = comment.source === "github" && onReply !== undefined
  return (
    <div className="comment-card">
      <div className="meta">
        <span className="author">{comment.author}</span>
        {comment.source === "github" && <span className="source-badge">GitHub</span>}
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
        {comment.source === "local" && (
          <button type="button" className="delete" onClick={() => void onDelete(comment)}>
            Delete
          </button>
        )}
        {canReply && (
          <button type="button" className="reply" onClick={() => setReplying((open) => !open)}>
            Reply
          </button>
        )}
      </div>
      <div className="body markdown">
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

const THEMES = { light: "github-light", dark: "github-dark" } as const

interface FileDiffSectionProps {
  file: FileDiffMetadata
  theme: "light" | "dark"
  diffStyle: "split" | "unified"
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
  // Hold the section as state via a callback ref, not a ref object: DiffConnectors
  // reads it in a layout effect, and layout effects fire bottom-up, so a child
  // would see a parent ref object as null. A stable setter only fires on mount.
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null)
  // Pierre renders the shadow DOM imperatively; onPostRender is our signal to
  // re-measure connector geometry. It must be stable and must NOT re-render the
  // FileDiff (that would re-fire onPostRender in a loop), so it pokes the
  // overlay through a ref instead of component state.
  const recomputeConnectors = useRef<() => void>(() => {})
  const onPostRender = useCallback(() => recomputeConnectors.current(), [])

  return (
    <section ref={setSectionEl} className="diff-file" data-file-anchor={file.name}>
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
          // Widen the seam between columns so connectors have room to draw.
          unsafeCSS: connectorsEnabled ? connectorGutterCSS : undefined,
          onPostRender: connectorsEnabled ? onPostRender : undefined,
          onLineNumberClick: (props) => {
            onDraftOpen({
              filePath: file.name,
              side: props.annotationSide,
              lineNumber: props.lineNumber,
            })
          },
        }}
        renderHeaderMetadata={(meta) =>
          meta.type === "deleted" ? null : (
            <button
              type="button"
              className="edit-file-button"
              onClick={() => onEditFile(meta.name)}
              title={`Edit ${meta.name}`}
            >
              Edit
            </button>
          )}
        lineAnnotations={annotations as Array<DiffLineAnnotation<AnnotationMeta>>}
        renderAnnotation={(annotation) => {
          const meta = annotation.metadata
          if (meta.kind === "draft") {
            return (
              <div className="annotation">
                <Composer
                  onCancel={onDraftCancel}
                  onSubmit={(body) =>
                    onCommentSubmit(
                      {
                        filePath: file.name,
                        side: annotation.side,
                        lineNumber: annotation.lineNumber,
                      },
                      body,
                    )}
                />
              </div>
            )
          }
          return (
            <div className="annotation">
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
      <DiffConnectors
        section={sectionEl}
        recomputeRef={recomputeConnectors}
        enabled={connectorsEnabled}
      />
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
  onCommentReply
}: DiffPaneProps) {
  const connectorsEnabled = connectors && diffStyle === "split"
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll the selected file's diff into view when picked in the tree.
  useEffect(() => {
    if (selectedFile === null) return
    const anchor = containerRef.current?.querySelector(
      `[data-file-anchor="${CSS.escape(selectedFile)}"]`
    )
    anchor?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [selectedFile])

  const annotationsByFile = useMemo(() => {
    const result = new Map<string, Array<DiffLineAnnotation<AnnotationMeta>>>()
    const grouped = new Map<string, {
      filePath: string
      side: CommentSide
      lineNumber: number
      comments: Array<ReviewComment>
    }>()
    for (const comment of comments) {
      const key = `${comment.side}:${comment.lineNumber}:${comment.filePath}`
      const bucket = grouped.get(key)
      if (bucket !== undefined) {
        bucket.comments.push(comment)
        continue
      }
      grouped.set(key, {
        filePath: comment.filePath,
        side: comment.side,
        lineNumber: comment.lineNumber,
        comments: [comment]
      })
    }
    for (const group of grouped.values()) {
      const annotations = result.get(group.filePath) ?? []
      annotations.push({
        side: group.side,
        lineNumber: group.lineNumber,
        metadata: { kind: "comments", comments: group.comments }
      })
      result.set(group.filePath, annotations)
    }
    if (draft !== null) {
      const annotations = result.get(draft.filePath) ?? []
      annotations.push({
        side: draft.side,
        lineNumber: draft.lineNumber,
        metadata: { kind: "draft" }
      })
      result.set(draft.filePath, annotations)
    }
    return result
  }, [comments, draft])

  if (loading) {
    return (
      <main className="diff-pane">
        <div className="diff-loading">Loading diff…</div>
      </main>
    )
  }

  if (error !== null) {
    return (
      <main className="diff-pane">
        <div className="diff-error">{error}</div>
      </main>
    )
  }

  if (files.length === 0) {
    return (
      <main className="diff-pane">
        <div className="diff-empty">
          <div>
            <div>Nothing to review</div>
            <div className="hint">{emptyHint(target)}</div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="diff-pane" ref={containerRef}>
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
    </main>
  )
}
