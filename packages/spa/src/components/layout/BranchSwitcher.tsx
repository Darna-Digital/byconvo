/**
 * BranchSwitcher — the top-bar branch dropdown, ported from the client's
 * `GitWidget` to the shadcn (base-ui) `DropdownMenu` primitives. It keeps the
 * JetBrains-style feature set: a filter box, collapsible Recent / Local /
 * Remote sections, folder grouping by the first path segment, ahead/behind and
 * upstream badges, and a per-branch action submenu (checkout, compare, merge,
 * rebase, rename, delete, …).
 */
import { useEffect, useMemo, useRef, useState } from "react"
import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconGitBranch,
  IconSearch,
  IconStarFilled,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { BranchInfo, RemoteBranchInfo } from "@/lib/api/types"

interface BranchSwitcherProps {
  current: string | null
  branches: ReadonlyArray<BranchInfo>
  remoteBranches: ReadonlyArray<RemoteBranchInfo>
  busy: boolean
  onCheckout: (ref: string) => void
  onCheckoutAndUpdate: (ref: string) => void
  onCreateBranch: (name: string, startPoint: string | null) => void
  onCompare: (base: string, head: string) => void
  onMerge: (branch: string) => void
  onRebase: (onto: string) => void
  onFetch: () => void
  onPush: () => void
  onRenameBranch: (name: string) => void
  onDeleteBranch: (name: string) => void
}

/** A branch the action submenu operates on, normalised across local/remote. */
interface BranchTarget {
  /** Full display name, e.g. "task/BMB-207" or "origin/feature". */
  readonly display: string
  /** The ref to check out — a local name, or a remote's short (tracking) name. */
  readonly ref: string
  readonly isCurrent: boolean
  readonly isRemote: boolean
}

/** Split "task/BMB-1" → ["task", "BMB-1"]; "main" → [null, "main"]. */
const splitFolder = (name: string): [string | null, string] => {
  const slash = name.indexOf("/")
  if (slash < 0) return [null, name]
  return [name.slice(0, slash), name.slice(slash + 1)]
}

interface FolderGroup<T> {
  readonly folder: string | null
  readonly items: ReadonlyArray<T>
}

/** Group rows by their first path segment, preserving order. */
const groupByFolder = <T,>(
  rows: ReadonlyArray<T>,
  nameOf: (row: T) => string,
): ReadonlyArray<FolderGroup<T>> => {
  const groups: Array<{ folder: string | null; items: Array<T> }> = []
  const index = new Map<string | null, number>()
  for (const row of rows) {
    const [folder] = splitFolder(nameOf(row))
    let at = index.get(folder)
    if (at === undefined) {
      at = groups.length
      index.set(folder, at)
      groups.push({ folder, items: [] })
    }
    groups[at]!.items.push(row)
  }
  return groups
}

export function BranchSwitcher(props: BranchSwitcherProps) {
  const { current, branches, remoteBranches, busy } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Recent + Local open by default, Remote collapsed — like JetBrains.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    recent: false,
    local: false,
    remote: true,
  })
  const searchRef = useRef<HTMLInputElement>(null)

  // base-ui highlights the first item on open; pull focus back to the filter.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (text: string) => q.length === 0 || text.toLowerCase().includes(q)
  // While searching, force every section open so hits are never hidden.
  const isCollapsed = (id: string) => q.length === 0 && collapsed[id] === true
  const toggleSection = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  const currentName = current ?? branches.find((b) => b.isCurrent)?.name ?? "—"

  const recent = useMemo(
    () => branches.filter((b) => matches(b.name)).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, q],
  )
  const localGroups = useMemo(
    () => groupByFolder(branches.filter((b) => matches(b.name)), (b) => b.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, q],
  )
  const remoteGroups = useMemo(
    () => groupByFolder(remoteBranches.filter((b) => matches(b.name)), (b) => b.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteBranches, q],
  )
  const localCount = localGroups.reduce((n, g) => n + g.items.length, 0)
  const remoteCount = remoteGroups.reduce((n, g) => n + g.items.length, 0)

  const showNew = matches("New Branch")
  const showRevision = matches("Checkout Tag or Revision")

  const newBranch = (startPoint: string | null, label: string) => {
    const name = window.prompt(
      startPoint === null ? "New branch name:" : `New branch from '${label}':`,
    )
    if (name && name.trim()) props.onCreateBranch(name.trim(), startPoint)
  }
  const checkoutRevision = () => {
    const ref = window.prompt("Checkout branch, tag, or revision:")
    if (ref && ref.trim()) props.onCheckout(ref.trim())
  }

  /** The JetBrains-style action list for one branch. */
  const renderActions = (t: BranchTarget) => (
    <>
      {!t.isCurrent && (
        <DropdownMenuItem onClick={() => props.onCheckout(t.ref)}>Checkout</DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => newBranch(t.ref, t.display)}>
        New Branch from ‘{t.display}’…
      </DropdownMenuItem>
      {!t.isCurrent && (
        <>
          <DropdownMenuItem onClick={() => props.onCheckoutAndUpdate(t.ref)}>
            Checkout and Update
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => props.onCompare(currentName, t.ref)}>
            Compare with ‘{currentName}’
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => props.onMerge(t.ref)}>
            Merge ‘{t.display}’ into ‘{currentName}’
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => props.onRebase(t.ref)}>
            Rebase ‘{currentName}’ onto ‘{t.display}’
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={props.onFetch}>Update</DropdownMenuItem>
      <DropdownMenuItem onClick={props.onPush}>Push…</DropdownMenuItem>
      {!t.isRemote && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => props.onRenameBranch(t.ref)}>Rename…</DropdownMenuItem>
          {!t.isCurrent && (
            <DropdownMenuItem variant="destructive" onClick={() => props.onDeleteBranch(t.ref)}>
              Delete
            </DropdownMenuItem>
          )}
        </>
      )}
    </>
  )

  const LocalRow = ({ branch, flat }: { branch: BranchInfo; flat?: boolean }) => {
    const leaf = flat ? branch.name : splitFolder(branch.name)[1]
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={cn(branch.isCurrent && "text-foreground")}>
          {branch.isCurrent ? (
            <IconStarFilled className="size-3.5 text-amber-500" />
          ) : (
            <IconGitBranch className="size-3.5 text-muted-foreground" />
          )}
          <span className={cn("truncate", branch.isCurrent && "font-medium")}>{leaf}</span>
          {(branch.ahead > 0 || branch.behind > 0) && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {branch.ahead > 0 ? `↑${branch.ahead}` : ""}
              {branch.behind > 0 ? ` ↓${branch.behind}` : ""}
            </span>
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64">
          {renderActions({
            display: branch.name,
            ref: branch.name,
            isCurrent: branch.isCurrent,
            isRemote: false,
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  const RemoteRow = ({ branch }: { branch: RemoteBranchInfo }) => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconGitBranch className="size-3.5 text-muted-foreground" />
        <span className="truncate">{splitFolder(branch.name)[1]}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{branch.remote}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {renderActions({
          display: branch.name,
          ref: branch.shortName,
          isCurrent: false,
          isRemote: true,
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <IconGitBranch className="size-3.5 text-muted-foreground" />
            {currentName}
            <IconChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-[70vh] w-72 overflow-auto p-0">
        {/* Filter box — a plain row, not a menu item, so typing never navigates. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-popover px-2 py-1.5">
          <IconSearch className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Let Escape bubble to dismiss the menu; swallow everything else
              // so base-ui's typeahead/arrow navigation doesn't hijack typing.
              if (e.key !== "Escape") e.stopPropagation()
            }}
            placeholder="Search for branches and actions"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="p-1">
          {showNew && (
            <DropdownMenuItem onClick={() => newBranch(null, "")}>New Branch…</DropdownMenuItem>
          )}
          {showRevision && (
            <DropdownMenuItem onClick={checkoutRevision}>
              Checkout Tag or Revision…
            </DropdownMenuItem>
          )}
          {(showNew || showRevision) && <DropdownMenuSeparator />}

          <Section
            title="Recent"
            count={recent.length}
            collapsed={isCollapsed("recent")}
            onToggle={() => toggleSection("recent")}
          >
            {recent.map((b) => (
              <LocalRow key={`r-${b.name}`} branch={b} flat />
            ))}
          </Section>

          <Section
            title="Local"
            count={localCount}
            collapsed={isCollapsed("local")}
            onToggle={() => toggleSection("local")}
          >
            {localGroups.map((g) => (
              <Folder key={`l-${g.folder ?? "_"}`} folder={g.folder} defaultOpen={q.length > 0}>
                {g.items.map((b) => (
                  <LocalRow key={b.name} branch={b} />
                ))}
              </Folder>
            ))}
          </Section>

          <Section
            title="Remote"
            count={remoteCount}
            collapsed={isCollapsed("remote")}
            onToggle={() => toggleSection("remote")}
          >
            {remoteGroups.map((g) => (
              <Folder key={`rm-${g.folder ?? "_"}`} folder={g.folder} defaultOpen={q.length > 0}>
                {g.items.map((b) => (
                  <RemoteRow key={b.name} branch={b} />
                ))}
              </Folder>
            ))}
          </Section>

          {recent.length === 0 && localCount === 0 && remoteCount === 0 && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No branches match “{query}”
            </div>
          )}
        </div>
        {busy && null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A collapsible section header; hidden when it has no rows. */
function Section({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div>
      <DropdownMenuItem
        closeOnClick={false}
        onClick={onToggle}
        className="gap-1 px-1.5 py-1 text-xs font-medium text-muted-foreground"
      >
        <IconChevronRight
          className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")}
        />
        <span>{title}</span>
        <span className="text-muted-foreground/70">{count}</span>
      </DropdownMenuItem>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

/** A collapsible folder group (the "task/" prefix). Flat when folder is null. */
function Folder({
  folder,
  defaultOpen,
  children,
}: {
  folder: string | null
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (folder === null) return <>{children}</>
  return (
    <div>
      <DropdownMenuItem
        closeOnClick={false}
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5 py-1 text-sm"
      >
        <IconChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        <IconFolder className="size-3.5 text-muted-foreground" />
        <span className="truncate">{folder}</span>
      </DropdownMenuItem>
      {open && <div className="pl-3">{children}</div>}
    </div>
  )
}
