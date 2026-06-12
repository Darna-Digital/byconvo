import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CommentSide, DiffTarget, ReviewComment } from "../types"

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
  onDelete
}: {
  comment: ReviewComment
  onDelete: (comment: ReviewComment) => Promise<void>
}) {
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
      </div>
      <div className="body">{comment.body}</div>
    </div>
  )
}

const THEMES = { light: "github-light", dark: "github-dark" } as const

export function DiffPane({
  files,
  theme,
  diffStyle,
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
  onCommentDelete
}: DiffPaneProps) {
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
        <section
          key={`${target.kind}-${file.prevName ?? ""}-${file.name}`}
          className="diff-file"
          data-file-anchor={file.name}
        >
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
              onLineNumberClick: (props) => {
                onDraftOpen({
                  filePath: file.name,
                  side: props.annotationSide,
                  lineNumber: props.lineNumber
                })
              }
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
            lineAnnotations={annotationsByFile.get(file.name) ?? []}
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
                            lineNumber: annotation.lineNumber
                          },
                          body
                        )}
                    />
                  </div>
                )
              }
              return (
                <div className="annotation">
                  {meta.comments.map((comment) => (
                    <CommentCard key={comment.id} comment={comment} onDelete={onCommentDelete} />
                  ))}
                </div>
              )
            }}
          />
        </section>
      ))}
    </main>
  )
}
