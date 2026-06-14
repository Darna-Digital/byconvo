/**
 * StatusBar — the JetBrains-style bottom decorator strip, ported from the
 * client's `StatusBar`. Left side carries the VCS decorators (branch + tracking,
 * incoming/outgoing commits, working-tree change counts, conflicts, a busy
 * indicator); the right side carries the editor decorators (caret position,
 * language, encoding, line separator, HEAD sha).
 *
 * Built on Tailwind + base-ui tooltips. Interactive widgets are real buttons;
 * read-only decorators are keyboard-reachable info chips so their hidden detail
 * (the change breakdown, the full sha, …) is available without a mouse.
 */
import { IconArrowDown, IconArrowUp, IconGitBranch } from "@tabler/icons-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CursorPosition } from "@/components/editor/CodeEditor"
import type { RepoInfo, RepoStatus } from "@/lib/api/types"

interface StatusBarProps {
  repo: RepoInfo | null
  status: RepoStatus | null
  /** A background git operation (commit/push/pull/checkout) is running. */
  busy: boolean
  /** The file open in the editor or read-only viewer, if any. */
  openPath: string | null
  /** Caret position while a file is being edited (null in the read-only viewer). */
  cursor: CursorPosition | null
  /** Open the repository picker — the branch decorator is the click target. */
  onRepoClick: () => void
}

// Map common extensions to the language label JetBrains shows on the right of
// its status bar. Anything unlisted falls back to the upper-cased extension.
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript JSX",
  js: "JavaScript",
  jsx: "JavaScript JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  htm: "HTML",
  md: "Markdown",
  mdx: "MDX",
  php: "PHP",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cs: "C#",
  swift: "Swift",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL",
  vue: "Vue",
  svelte: "Svelte",
}

const languageForPath = (path: string): string | null => {
  const ext = path.split(".").at(-1)?.toLowerCase()
  if (ext === undefined || ext === path.toLowerCase()) return null
  return LANGUAGE_BY_EXT[ext] ?? ext.toUpperCase()
}

/**
 * A read-only decorator. Renders as a keyboard-reachable chip so a tooltip's
 * hidden detail is available without a pointer; falls back to a plain span when
 * there is no extra detail to surface.
 */
function StatusItem({
  tooltip,
  label,
  className,
  children,
}: {
  /** Rich detail revealed on hover/focus; omit for a non-interactive chip. */
  tooltip?: React.ReactNode
  /** Self-contained description announced to assistive tech. */
  label?: string
  className?: string
  children: React.ReactNode
}) {
  const chip = (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-0.5 outline-none",
        tooltip !== undefined &&
          "cursor-default hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={label}
    >
      {children}
    </span>
  )
  if (tooltip === undefined) return chip
  return (
    <Tooltip>
      <TooltipTrigger tabIndex={0} render={chip} />
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function StatusBar({ repo, status, busy, openPath, cursor, onRepoClick }: StatusBarProps) {
  const branch = status?.branch || repo?.currentBranch || null
  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const changed = status?.changed ?? 0
  const conflicted = status?.conflicted ?? 0
  const language = openPath !== null ? languageForPath(openPath) : null

  const changesTooltip =
    status === null ? null : (
      <span className="tabular-nums">
        {status.staged} staged · {status.unstaged} unstaged · {status.untracked} untracked
        {status.conflicted > 0 ? ` · ${status.conflicted} conflicted` : ""}
      </span>
    )

  return (
    <footer
      aria-label="Repository status"
      className="flex h-6 shrink-0 select-none items-stretch justify-between border-t bg-sidebar px-1 text-[11px] text-muted-foreground"
    >
      {/* VCS decorators */}
      <div className="flex items-stretch">
        {branch !== null && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onRepoClick}
                  aria-label={`Current branch ${branch}. Open repository picker.`}
                  className="flex items-center gap-1.5 rounded-sm px-1.5 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <IconGitBranch className="size-3 shrink-0 text-muted-foreground/80" aria-hidden />
              <span className="max-w-[220px] truncate font-medium text-foreground">{branch}</span>
              {(ahead > 0 || behind > 0) && (
                <span className="flex items-center gap-1 text-muted-foreground/80 tabular-nums">
                  {behind > 0 && (
                    <span className="flex items-center" aria-label={`${behind} commits behind`}>
                      <IconArrowDown className="size-3" aria-hidden />
                      {behind}
                    </span>
                  )}
                  {ahead > 0 && (
                    <span className="flex items-center" aria-label={`${ahead} commits ahead`}>
                      <IconArrowUp className="size-3" aria-hidden />
                      {ahead}
                    </span>
                  )}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent side="top">
              {status?.upstream ? `Tracking ${status.upstream}` : "Not tracking a remote branch"}
            </TooltipContent>
          </Tooltip>
        )}

        {busy && (
          <span className="flex items-center gap-1.5 px-1.5" role="status">
            <span
              aria-hidden
              className="size-3 animate-spin rounded-full border-[1.5px] border-border border-t-primary"
            />
            Working…
          </span>
        )}

        {changed > 0 && changesTooltip !== null && (
          <StatusItem tooltip={changesTooltip} label={`${changed} files changed`}>
            <span className="tabular-nums">{changed} changed</span>
          </StatusItem>
        )}
        {conflicted > 0 && changesTooltip !== null && (
          <StatusItem
            tooltip={changesTooltip}
            label={`${conflicted} files conflicted`}
            className="font-semibold text-destructive"
          >
            <span className="tabular-nums">{conflicted} conflicted</span>
          </StatusItem>
        )}
      </div>

      {/* Editor decorators */}
      <div className="flex items-stretch">
        {cursor !== null && (
          <StatusItem label={`Line ${cursor.line}, column ${cursor.col}`}>
            <span className="font-mono text-[10.5px]">
              {cursor.line}:{cursor.col}
            </span>
          </StatusItem>
        )}
        {language !== null && <StatusItem label={`Language: ${language}`}>{language}</StatusItem>}
        {openPath !== null && (
          <>
            <StatusItem tooltip="File encoding" label="File encoding: UTF-8">
              UTF-8
            </StatusItem>
            <StatusItem tooltip="Line separator" label="Line separator: LF">
              LF
            </StatusItem>
          </>
        )}
        {status?.headSha && (
          <StatusItem tooltip={`HEAD commit ${status.headSha}`} label={`HEAD commit ${status.headSha}`}>
            <span className="font-mono text-[10.5px] text-muted-foreground/80">
              {status.headSha.slice(0, 7)}
            </span>
          </StatusItem>
        )}
      </div>
    </footer>
  )
}
