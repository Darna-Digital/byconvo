import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CommentThread,
  DraftCard,
  type DraftLocation,
} from "@/components/comments/CommentThread"
import {
  DiffConnectors,
  connectorGutterCSS,
} from "@/components/diff/DiffConnectors"
import type { CommentSide, DiffTarget, ReviewComment } from "@/lib/api/types"
import type { DiffStyle, Theme } from "@/lib/ui-prefs"

export type { DraftLocation }

type AnnotationMeta =
  | {
      readonly kind: "comments"
      readonly comments: ReadonlyArray<ReviewComment>
    }
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

interface FileDiffSectionProps {
  file: FileDiffMetadata
  theme: Theme
  diffStyle: DiffStyle
  connectorsEnabled: boolean
  annotations: ReadonlyArray<DiffLineAnnotation<AnnotationMeta>>
  selectedLines: SelectedLineRange | null
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
  selectedLines,
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
    <section
      ref={setSectionEl}
      className="diff-file relative border-b"
      data-file-anchor={file.name}
    >
      <FileDiff<AnnotationMeta>
        fileDiff={file}
        disableWorkerPool
        selectedLines={selectedLines}
        options={{
          theme: THEMES,
          themeType: theme,
          diffStyle,
          lineDiffType: "word",
          overflow: diffStyle === "split" ? "scroll" : "wrap",
          stickyHeader: false,
          enableGutterUtility: true,
          unsafeCSS: connectorsEnabled ? connectorGutterCSS : undefined,
          onPostRender: connectorsEnabled ? onPostRender : undefined,
          onGutterUtilityClick: (range) =>
            onDraftOpen({
              filePath: file.name,
              side: range.side ?? "additions",
              lineNumber: range.end,
            }),
          onLineNumberClick: (props) =>
            onDraftOpen({
              filePath: file.name,
              side: props.annotationSide,
              lineNumber: props.lineNumber,
            }),
        }}
        renderHeaderMetadata={(meta) =>
          meta.type === "deleted" ? null : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onEditFile(meta.name)}
            >
              Edit
            </Button>
          )
        }
        lineAnnotations={
          annotations as Array<DiffLineAnnotation<AnnotationMeta>>
        }
        renderAnnotation={(annotation) => {
          const meta = annotation.metadata
          if (meta.kind === "draft") {
            return (
              <DraftCard
                onCancel={onDraftCancel}
                onSubmit={(body) =>
                  onCommentSubmit(
                    {
                      filePath: file.name,
                      side: annotation.side,
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
              onReply={onCommentReply}
            />
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
  onCommentReply,
}: DiffPaneProps) {
  const connectorsEnabled = connectors && diffStyle === "split"
  const containerRef = useRef<HTMLDivElement>(null)

  // Animate the selected file's diff to the top of the pane. Hard-won details:
  //  - Native smooth scrolling (`scrollIntoView`/`scrollTo({behavior:"smooth"})`,
  //    CSS `scroll-behavior`) is a silent no-op in this pane — the nested
  //    overflow-hidden ancestors break it in Chromium. Only instant `scrollTop`
  //    writes take effect, so we roll the animation ourselves with rAF.
  //  - Each frame eases ~20% of the remaining distance and *recomputes* the
  //    target, so the animation stays accurate while the diffs lay out
  //    progressively (the anchor keeps moving for a moment after selection).
  //  - We bail the instant the user takes over via real input (wheel/touch/
  //    pointer/key) — never on scroll events, which also fire from our own
  //    animation and from layout reflow.
  //  - rAF is throttled in background tabs, so a timed fallback jumps straight to
  //    the target if no frame has run.
  useEffect(() => {
    if (selectedFile === null) return
    const container = containerRef.current
    if (container == null) return

    let active = true
    let raf = 0
    let lastFrame = 0
    const startedAt = performance.now()
    const cleanups: Array<() => void> = []

    const targetTop = (): number | null => {
      const anchor = container.querySelector(
        `[data-file-anchor="${CSS.escape(selectedFile)}"]`
      )
      if (!(anchor instanceof HTMLElement)) return null
      const max = container.scrollHeight - container.clientHeight
      return Math.min(
        anchor.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop,
        max
      )
    }

    const stop = () => {
      if (!active) return
      active = false
      cancelAnimationFrame(raf)
      for (const cleanup of cleanups) cleanup()
    }

    const frame = (now: number) => {
      if (!active) return
      lastFrame = now
      const top = targetTop()
      if (top !== null) {
        const delta = top - container.scrollTop
        container.scrollTop =
          Math.abs(delta) <= 1 ? top : container.scrollTop + delta * 0.2
      }
      // Keep following while the content settles; then stop.
      if (now - startedAt < 1200) raf = requestAnimationFrame(frame)
      else stop()
    }

    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      container.addEventListener(type, stop, { passive: true })
      cleanups.push(() => container.removeEventListener(type, stop))
    }

    // Background-tab fallback: if rAF hasn't run (throttled), jump to target.
    const fallback = setTimeout(() => {
      if (!active || performance.now() - lastFrame < 100) return
      const top = targetTop()
      if (top !== null) container.scrollTop = top
    }, 250)
    cleanups.push(() => clearTimeout(fallback))

    raf = requestAnimationFrame(frame)

    return stop
  }, [selectedFile, files])

  const annotationsByFile = useMemo(() => {
    const result = new Map<string, Array<DiffLineAnnotation<AnnotationMeta>>>()
    const grouped = new Map<
      string,
      {
        filePath: string
        side: CommentSide
        lineNumber: number
        comments: ReviewComment[]
      }
    >()
    for (const c of comments) {
      const key = `${c.side}:${c.lineNumber}:${c.filePath}`
      const bucket = grouped.get(key)
      if (bucket) bucket.comments.push(c)
      else
        grouped.set(key, {
          filePath: c.filePath,
          side: c.side,
          lineNumber: c.lineNumber,
          comments: [c],
        })
    }
    for (const g of grouped.values()) {
      const arr = result.get(g.filePath) ?? []
      arr.push({
        side: g.side,
        lineNumber: g.lineNumber,
        metadata: { kind: "comments", comments: g.comments },
      })
      result.set(g.filePath, arr)
    }
    if (draft !== null) {
      const arr = result.get(draft.filePath) ?? []
      arr.push({
        side: draft.side,
        lineNumber: draft.lineNumber,
        metadata: { kind: "draft" },
      })
      result.set(draft.filePath, arr)
    }
    return result
  }, [comments, draft])

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading diff…</div>
    )
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
          selectedLines={
            draft !== null && draft.filePath === file.name
              ? {
                  start: draft.lineNumber,
                  end: draft.lineNumber,
                  side: draft.side,
                  endSide: draft.side,
                }
              : null
          }
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
