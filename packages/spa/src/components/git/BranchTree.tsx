import {
  IconChevronRight,
  IconGitBranch,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { useRef, useState } from "react"
import type {
  BranchLeaf,
  BranchTreeItem,
} from "@/features/branch-tree/entity/branch-tree.interfaces"
import { useBranchTree } from "@/features/branch-tree/adapters/branch-tree.hook.adapter"
import type { BranchInfo, RemoteBranchInfo } from "@/lib/api/types"
import { cn } from "@/lib/utils"

interface BranchTreeProps {
  branches: ReadonlyArray<BranchInfo>
  remoteBranches: ReadonlyArray<RemoteBranchInfo>
  currentBranch: string | null
  /** The ref the history is currently showing (drives the selected highlight). */
  selectedRef: string | null
  query?: string
  onSelect: (ref: string) => void
  onCheckout: (ref: string) => void
}

type NavRow =
  | {
      kind: "section"
      id: string
      sectionId: string
      label: string
      expanded: boolean
    }
  | {
      kind: "folder"
      id: string
      path: string
      label: string
      depth: number
      expanded: boolean
    }
  | { kind: "branch"; id: string; item: BranchLeaf; depth: number }

const indent = (depth: number): React.CSSProperties => ({
  paddingLeft: 8 + (depth - 1) * 14,
})

export function BranchTree({
  branches,
  remoteBranches,
  currentBranch,
  selectedRef,
  query = "",
  onSelect,
  onCheckout,
}: BranchTreeProps) {
  const { functions, favorites, expanded, toggleFavorite, toggleFolder } =
    useBranchTree()
  const [activeId, setActiveId] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())

  const { local, remote } = functions.buildTrees({
    branches,
    remoteBranches,
    favorites,
    query,
  })

  // While filtering, force every folder open so matches are never hidden.
  const filtering = query.trim().length > 0
  const isOpen = (path: string) => filtering || expanded.has(path)

  // The flat, top-to-bottom list of focusable rows (drives roving tabindex + arrows).
  const navRows: NavRow[] = []
  const pushSection = (
    sectionId: string,
    label: string,
    items: ReadonlyArray<BranchTreeItem>
  ) => {
    const open = isOpen(sectionId)
    navRows.push({
      kind: "section",
      id: sectionId,
      sectionId,
      label,
      expanded: open,
    })
    if (!open) return
    for (const row of functions.flatten(items, isOpen, 2)) {
      navRows.push(
        row.item.kind === "folder"
          ? {
              kind: "folder",
              id: row.key,
              path: row.item.path,
              label: row.item.label,
              depth: row.depth,
              expanded: row.expanded,
            }
          : { kind: "branch", id: row.key, item: row.item, depth: row.depth }
      )
    }
  }
  pushSection("__local", "Local", local)
  if (remote.length > 0) pushSection("__remote", "Remote", remote)

  const effectiveActive =
    activeId ?? (navRows.length > 0 ? navRows[0].id : null)

  const move = (delta: number) => {
    if (navRows.length === 0) return
    const idx = navRows.findIndex((r) => r.id === effectiveActive)
    const next = navRows[Math.max(0, Math.min(navRows.length - 1, idx + delta))]
    setActiveId(next.id)
    rows.current.get(next.id)?.focus()
  }

  const focusId = (id: string) => {
    setActiveId(id)
    requestAnimationFrame(() => rows.current.get(id)?.focus())
  }

  const activate = (row: NavRow) => {
    if (row.kind === "section") toggleFolder(row.sectionId)
    else if (row.kind === "folder") toggleFolder(row.path)
    else onSelect(row.item.fullName)
  }

  const onKeyDown = (event: React.KeyboardEvent, row: NavRow) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        move(1)
        break
      case "ArrowUp":
        event.preventDefault()
        move(-1)
        break
      case "Home":
        event.preventDefault()
        if (navRows[0]) focusId(navRows[0].id)
        break
      case "End":
        event.preventDefault()
        if (navRows.at(-1)) focusId(navRows.at(-1)!.id)
        break
      case "ArrowRight":
        if (row.kind !== "branch" && !row.expanded) {
          event.preventDefault()
          toggleFolder(row.kind === "section" ? row.sectionId : row.path)
        } else {
          event.preventDefault()
          move(1)
        }
        break
      case "ArrowLeft":
        if (row.kind !== "branch" && row.expanded && !filtering) {
          event.preventDefault()
          toggleFolder(row.kind === "section" ? row.sectionId : row.path)
        } else {
          event.preventDefault()
          move(-1)
        }
        break
      case "Enter":
      case " ":
        event.preventDefault()
        activate(row)
        break
    }
  }

  const setRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el)
    else rows.current.delete(id)
  }

  const rowClass = (active: boolean) =>
    cn(
      "flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm outline-none",
      "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
      active && "ring-2 ring-ring/40"
    )

  const chevron = (open: boolean) => (
    <IconChevronRight
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform",
        open && "rotate-90"
      )}
    />
  )

  return (
    <div role="tree" aria-label="Branches" className="py-1 text-sm select-none">
      {currentBranch !== null && (
        <button
          type="button"
          role="treeitem"
          aria-level={1}
          aria-selected={selectedRef === currentBranch}
          tabIndex={effectiveActive === "__head" ? 0 : -1}
          ref={setRef("__head")}
          className={cn(
            rowClass(effectiveActive === "__head"),
            "gap-2 pl-2",
            selectedRef === currentBranch && "bg-accent text-accent-foreground"
          )}
          onFocus={() => setActiveId("__head")}
          onClick={() => onSelect(currentBranch)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelect(currentBranch)
            } else if (e.key === "ArrowDown") {
              e.preventDefault()
              move(1)
            }
          }}
          title="Current branch"
        >
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            HEAD
          </span>
          <span className="truncate font-medium">{currentBranch}</span>
        </button>
      )}

      {navRows.map((row) => {
        const active = effectiveActive === row.id
        if (row.kind === "section") {
          return (
            <button
              key={row.id}
              type="button"
              role="treeitem"
              aria-level={1}
              aria-expanded={row.expanded}
              tabIndex={active ? 0 : -1}
              ref={setRef(row.id)}
              className={cn(
                rowClass(active),
                "pl-2 font-medium text-muted-foreground"
              )}
              onFocus={() => setActiveId(row.id)}
              onClick={() => toggleFolder(row.sectionId)}
              onKeyDown={(e) => onKeyDown(e, row)}
            >
              {chevron(row.expanded)}
              <span>{row.label}</span>
            </button>
          )
        }
        if (row.kind === "folder") {
          return (
            <button
              key={row.id}
              type="button"
              role="treeitem"
              aria-level={row.depth}
              aria-expanded={row.expanded}
              tabIndex={active ? 0 : -1}
              ref={setRef(row.id)}
              className={rowClass(active)}
              style={indent(row.depth)}
              onFocus={() => setActiveId(row.id)}
              onClick={() => toggleFolder(row.path)}
              onKeyDown={(e) => onKeyDown(e, row)}
            >
              {chevron(row.expanded)}
              <span className="truncate text-muted-foreground">
                {row.label}
              </span>
            </button>
          )
        }
        const branch = row.item
        const fav = favorites.has(branch.fullName)
        const selected = selectedRef === branch.fullName
        return (
          <div
            key={row.id}
            role="treeitem"
            aria-level={row.depth}
            aria-selected={selected}
            tabIndex={active ? 0 : -1}
            ref={setRef(row.id)}
            className={cn(
              rowClass(active),
              "group cursor-pointer",
              selected && "bg-accent text-accent-foreground"
            )}
            style={indent(row.depth)}
            onFocus={() => setActiveId(row.id)}
            onClick={() => onSelect(branch.fullName)}
            onDoubleClick={() => onCheckout(branch.fullName)}
            onKeyDown={(e) => onKeyDown(e, row)}
            title={`${branch.fullName}\nDouble-click to check out`}
          >
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
                fav && "text-amber-500 opacity-100"
              )}
              aria-label={
                fav
                  ? `Unfavorite ${branch.fullName}`
                  : `Favorite ${branch.fullName}`
              }
              aria-pressed={fav}
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(branch.fullName)
              }}
            >
              {fav ? (
                <IconStarFilled className="size-3" />
              ) : (
                <IconStar className="size-3" />
              )}
            </button>
            <IconGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", branch.isCurrent && "font-medium")}>
              {branch.label}
            </span>
            {branch.isCurrent && (
              <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                HEAD
              </span>
            )}
            {(branch.behind > 0 || branch.ahead > 0) && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {branch.behind > 0 && (
                  <span title={`${branch.behind} incoming`}>
                    ↓{branch.behind}
                  </span>
                )}
                {branch.ahead > 0 && (
                  <span title={`${branch.ahead} outgoing`}>
                    {" "}
                    ↑{branch.ahead}
                  </span>
                )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
