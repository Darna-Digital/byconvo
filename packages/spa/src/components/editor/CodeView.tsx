import {
  getFiletypeFromFileName,
  getHighlighterOptions,
  type LineAnnotation,
  preloadHighlighter,
} from "@pierre/diffs"
import { File } from "@pierre/diffs/react"
import { IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import {
  CommentThread,
  DraftCard,
  type DraftLocation,
} from "@/components/comments/CommentThread"
import { Button } from "@/components/ui/button"
import { useFile } from "@/lib/queries"
import type { ReviewComment } from "@/lib/api/types"
import type { Theme } from "@/lib/ui-prefs"

const THEMES = { light: "github-light", dark: "github-dark" } as const

// Languages whose Shiki grammar has finished loading into the shared
// highlighter. The highlighter only reliably highlights a file when its
// language is already attached at mount time, so we preload per language and
// remember what's ready to avoid re-gating on repeat visits.
const readyLangs = new Set<string>()

// Comments on a plain (non-diff) file are always anchored to the current
// content, i.e. the "additions" side of an eventual worktree diff.
const FILE_COMMENT_SIDE = "additions" as const

type AnnotationMeta =
  | {
      readonly kind: "comments"
      readonly comments: ReadonlyArray<ReviewComment>
    }
  | { readonly kind: "draft" }

interface CodeViewProps {
  path: string
  theme: Theme
  onEdit: (path: string) => void
  onClose: () => void
  /** Local review comments anchored to this file (optional — omit to disable). */
  comments?: ReadonlyArray<ReviewComment>
  draft?: DraftLocation | null
  onDraftOpen?: (draft: DraftLocation) => void
  onDraftCancel?: () => void
  onCommentSubmit?: (location: DraftLocation, body: string) => Promise<void>
  onCommentDelete?: (comment: ReviewComment) => Promise<void>
}

export function CodeView({
  path,
  theme,
  onEdit,
  onClose,
  comments,
  draft = null,
  onDraftOpen,
  onDraftCancel,
  onCommentSubmit,
  onCommentDelete,
}: CodeViewProps) {
  const file = useFile(path)
  const lang = getFiletypeFromFileName(path)
  const [langReady, setLangReady] = useState(() => readyLangs.has(lang))
  const commentsEnabled =
    onCommentSubmit !== undefined && onCommentDelete !== undefined

  // Ensure the file's language grammar is attached before mounting `File`;
  // otherwise it renders unhighlighted and won't re-highlight in place when the
  // grammar later loads (it only highlights cleanly on a fresh mount).
  useEffect(() => {
    if (readyLangs.has(lang)) {
      setLangReady(true)
      return
    }
    setLangReady(false)
    let cancelled = false
    const done = () => {
      readyLangs.add(lang)
      if (!cancelled) setLangReady(true)
    }
    void preloadHighlighter(
      getHighlighterOptions(lang, { theme: THEMES })
    ).then(done, done)
    return () => {
      cancelled = true
    }
  }, [lang])

  // Group this file's comments (and the open draft) into per-line annotations.
  const annotations = useMemo<Array<LineAnnotation<AnnotationMeta>>>(() => {
    const byLine = new Map<number, ReviewComment[]>()
    for (const c of comments ?? []) {
      const bucket = byLine.get(c.lineNumber)
      if (bucket) bucket.push(c)
      else byLine.set(c.lineNumber, [c])
    }
    const out: Array<LineAnnotation<AnnotationMeta>> = []
    for (const [lineNumber, group] of byLine) {
      out.push({ lineNumber, metadata: { kind: "comments", comments: group } })
    }
    if (draft !== null && draft.filePath === path) {
      out.push({ lineNumber: draft.lineNumber, metadata: { kind: "draft" } })
    }
    return out
  }, [comments, draft, path])

  if (file.isPending || !langReady) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading {path}…</div>
    )
  }
  if (file.error || file.data === undefined) {
    return (
      <div className="p-8 text-sm text-destructive">Could not open {path}</div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <section className="diff-file" data-file-anchor={path}>
        {/* Remount per file: the underlying File instance doesn't re-highlight
            when only its `file` prop changes, so navigating between files would
            otherwise show the new contents unhighlighted until a reload. */}
        <File<AnnotationMeta>
          key={path}
          file={{ name: path, contents: file.data.contents }}
          disableWorkerPool
          options={{
            theme: THEMES,
            themeType: theme,
            overflow: "wrap",
            stickyHeader: false,
            enableLineSelection: commentsEnabled,
            onLineNumberClick: commentsEnabled
              ? (props) =>
                  onDraftOpen?.({
                    filePath: path,
                    side: FILE_COMMENT_SIDE,
                    lineNumber: props.lineNumber,
                  })
              : undefined,
          }}
          lineAnnotations={commentsEnabled ? annotations : undefined}
          renderAnnotation={
            commentsEnabled
              ? (annotation) => {
                  const meta = annotation.metadata
                  if (meta === undefined) return null
                  if (meta.kind === "draft") {
                    return (
                      <DraftCard
                        onCancel={() => onDraftCancel?.()}
                        onSubmit={(body) =>
                          onCommentSubmit(
                            {
                              filePath: path,
                              side: FILE_COMMENT_SIDE,
                              lineNumber: annotation.lineNumber,
                            },
                            body
                          )
                        }
                      />
                    )
                  }
                  return (
                    <CommentThread
                      comments={meta.comments}
                      onDelete={onCommentDelete}
                    />
                  )
                }
              : undefined
          }
          renderHeaderMetadata={(meta) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onEdit(meta.name)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                aria-label="Close"
              >
                <IconX />
              </Button>
            </div>
          )}
        />
      </section>
    </div>
  )
}
