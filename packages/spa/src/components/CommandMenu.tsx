/**
 * CommandMenu — the ⌘K / Ctrl+K command palette. It overlays a single search
 * box that filters two kinds of entries:
 *
 *  - **Commands**: common app actions (switch mode, git fetch/push/pull, toggle
 *    theme/diff-style/panels, switch repository). These are built by `AppShell`
 *    (the one place with navigate + git actions + ui-prefs in scope) and handed
 *    in via `commands`, so the palette stays presentational.
 *  - **Files**: every path in the current repo. Selecting one jumps to it via
 *    `onOpenFile` (the same read-only file view the sidebar opens).
 *
 * Navigation is keyboard-first: a flat, ordered list of the currently-visible
 * entries drives ↑/↓ + Enter, while the render groups them under headings. The
 * global ⌘K listener lives here so the whole feature is self-contained.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { IconCornerDownLeft, IconFile, IconSearch } from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface Command {
  readonly id: string
  readonly label: string
  /** Heading the command is grouped under (e.g. "Navigation", "Git"). */
  readonly group: string
  readonly icon: React.ComponentType<{ className?: string }>
  /** Extra search terms not shown in the label (e.g. "dark light system"). */
  readonly keywords?: string
  /** Right-aligned hint — a current value or shortcut. */
  readonly hint?: string
  readonly run: () => void
}

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly Command[]
  /** All repo file paths, for the "jump to file" search. */
  files: readonly string[]
  onOpenFile: (path: string) => void
}

/** A flat, render-order entry; `index` drives keyboard selection. */
interface Entry {
  readonly key: string
  readonly group: string
  readonly icon: React.ComponentType<{ className?: string }>
  readonly label: string
  readonly hint?: string
  readonly run: () => void
}

const MAX_FILES = 40

/**
 * Subsequence match: every char of `query` must appear in `text` in order.
 * Returns a score (lower = better: tighter, earlier matches win) or null for no
 * match. Empty query matches everything with a neutral score.
 */
function fuzzyScore(text: string, query: string): number | null {
  if (query === "") return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  let firstHit = -1
  let lastHit = -1
  for (const c of q) {
    const found = t.indexOf(c, ti)
    if (found === -1) return null
    if (firstHit === -1) firstHit = found
    lastHit = found
    ti = found + 1
  }
  // Reward early start + compact span (span ≈ how spread-out the match is).
  return firstHit + (lastHit - firstHit) * 0.5
}

export function CommandMenu({
  open,
  onOpenChange,
  commands,
  files,
  onOpenFile,
}: CommandMenuProps) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // Fresh search each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
    }
  }, [open])

  const q = query.trim().toLowerCase()

  const entries = useMemo<Entry[]>(() => {
    const cmdMatches = commands
      .map((c) => ({
        c,
        score: fuzzyScore(`${c.label} ${c.keywords ?? ""} ${c.group}`, q),
      }))
      .filter((m): m is { c: Command; score: number } => m.score !== null)
      .sort((a, b) => a.score - b.score)
      .map(
        ({ c }): Entry => ({
          key: `cmd:${c.id}`,
          group: c.group,
          icon: c.icon,
          label: c.label,
          hint: c.hint,
          run: c.run,
        })
      )

    // Only search files once the user types — the full repo list would bury the
    // actions otherwise.
    const fileMatches =
      q === ""
        ? []
        : files
            .map((p) => ({ p, score: fuzzyScore(p, q) }))
            .filter((m): m is { p: string; score: number } => m.score !== null)
            .sort((a, b) => a.score - b.score)
            .slice(0, MAX_FILES)
            .map(
              ({ p }): Entry => ({
                key: `file:${p}`,
                group: "Files",
                icon: IconFile,
                label: p,
                run: () => onOpenFile(p),
              })
            )

    // Commands first so the most-common actions stay reachable from the top.
    return [...cmdMatches, ...fileMatches]
  }, [commands, files, q, onOpenFile])

  // Keep the active index in range as the result set shrinks/grows.
  useEffect(() => {
    setActive((a) =>
      entries.length === 0 ? 0 : Math.min(a, entries.length - 1)
    )
  }, [entries.length])

  const run = (entry: Entry | undefined) => {
    if (entry === undefined) return
    onOpenChange(false)
    entry.run()
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => (entries.length === 0 ? 0 : (a + 1) % entries.length))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) =>
        entries.length === 0 ? 0 : (a - 1 + entries.length) % entries.length
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      run(entries[active])
    } else if (e.key === "Home") {
      e.preventDefault()
      setActive(0)
    } else if (e.key === "End") {
      e.preventDefault()
      setActive(Math.max(0, entries.length - 1))
    }
  }

  // Scroll the active row into view on keyboard movement.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="command-menu"
          initialFocus={inputRef}
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-[min(var(--radius-4xl),20px)] bg-popover text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-100 outline-none sm:max-w-xl dark:ring-foreground/10",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command menu
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2 border-b px-3.5">
            <IconSearch className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Type a command or search files…"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5"
          >
            {entries.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground">
                No results found.
              </div>
            ) : (
              entries.map((entry, i) => {
                const prev = entries[i - 1]
                const showHeader =
                  prev === undefined || prev.group !== entry.group
                const Icon = entry.icon
                const isActive = i === active
                const isFile = entry.group === "Files"
                return (
                  <div key={entry.key}>
                    {showHeader && (
                      <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                        {entry.group}
                      </div>
                    )}
                    <button
                      type="button"
                      data-index={i}
                      // Hover updates selection so mouse + keyboard stay in sync.
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(entry)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          isFile && "font-mono text-[0.8125rem]"
                        )}
                      >
                        {isFile ? <FilePath path={entry.label} /> : entry.label}
                      </span>
                      {entry.hint !== undefined && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {entry.hint}
                        </span>
                      )}
                      {isActive && (
                        <IconCornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate
            </span>
            <span>
              <Kbd>↵</Kbd> to select · <Kbd>esc</Kbd> to close
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

/** Render a path with a dimmed directory and an emphasised file name. */
function FilePath({ path }: { path: string }) {
  const slash = path.lastIndexOf("/")
  if (slash === -1) return <>{path}</>
  return (
    <>
      <span className="text-muted-foreground">{path.slice(0, slash + 1)}</span>
      {path.slice(slash + 1)}
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border bg-muted px-1 font-sans text-[0.625rem] text-muted-foreground">
      {children}
    </kbd>
  )
}
