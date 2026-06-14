import { IconSearch, IconX } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BranchInfo, LogQuery } from "@/lib/api/types"
import { cn } from "@/lib/utils"

interface LogFiltersProps {
  refName: string
  branches: ReadonlyArray<BranchInfo>
  query: LogQuery
  onRefChange: (ref: string) => void
  onQueryChange: (query: LogQuery) => void
}

const blank = (value: string): string | null =>
  value.trim().length > 0 ? value.trim() : null

/**
 * History toolbar. Text fields apply on Enter/blur; the branch picker, toggles
 * and date apply immediately. Local drafts keep typing responsive between
 * commits, and re-sync when the query is cleared from outside.
 */
export function LogFilters({
  refName,
  branches,
  query,
  onRefChange,
  onQueryChange,
}: LogFiltersProps) {
  const [grep, setGrep] = useState(query.grep ?? "")
  const [author, setAuthor] = useState(query.author ?? "")
  const [path, setPath] = useState(query.path ?? "")

  useEffect(() => setGrep(query.grep ?? ""), [query.grep])
  useEffect(() => setAuthor(query.author ?? ""), [query.author])
  useEffect(() => setPath(query.path ?? ""), [query.path])

  const apply = (patch: Partial<LogQuery>) =>
    onQueryChange({ ...query, ...patch })

  const hasFilters =
    query.grep !== null ||
    query.author !== null ||
    query.path !== null ||
    query.after !== null ||
    query.before !== null

  const knownRef = branches.some((b) => b.name === refName)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-2">
      <Select
        value={refName}
        onValueChange={(value: string | null) => {
          if (value !== null) onRefChange(value)
        }}
      >
        <SelectTrigger size="sm" className="max-w-56" aria-label="Branch">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!knownRef && <SelectItem value={refName}>{refName}</SelectItem>}
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex min-w-44 flex-1 items-center">
        <IconSearch className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
        <Input
          className="h-7 pr-16 pl-7 text-xs"
          placeholder="Text or hash"
          aria-label="Filter by text or hash"
          value={grep}
          onChange={(e) => setGrep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ grep: blank(grep) })
          }}
          onBlur={() => apply({ grep: blank(grep) })}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          <FilterToggle
            active={query.regex}
            label="Regular expression"
            onClick={() =>
              onQueryChange({
                ...query,
                grep: blank(grep),
                regex: !query.regex,
              })
            }
          >
            .*
          </FilterToggle>
          <FilterToggle
            active={query.caseSensitive}
            label="Match case"
            onClick={() =>
              onQueryChange({
                ...query,
                grep: blank(grep),
                caseSensitive: !query.caseSensitive,
              })
            }
          >
            Cc
          </FilterToggle>
        </div>
      </div>

      <Input
        className="h-7 w-32 text-xs"
        placeholder="User"
        aria-label="Filter by author"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ author: blank(author) })
        }}
        onBlur={() => apply({ author: blank(author) })}
      />

      <Input
        type="date"
        className="h-7 w-36 text-xs"
        aria-label="Since date"
        value={query.after ?? ""}
        onChange={(e) =>
          apply({ after: e.target.value.length > 0 ? e.target.value : null })
        }
      />

      <Input
        className="h-7 w-32 text-xs"
        placeholder="Paths"
        aria-label="Filter by path"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ path: blank(path) })
        }}
        onBlur={() => apply({ path: blank(path) })}
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() =>
            onQueryChange({
              author: null,
              grep: null,
              regex: query.regex,
              caseSensitive: query.caseSensitive,
              after: null,
              before: null,
              path: null,
            })
          }
        >
          <IconX className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  )
}

function FilterToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-5 min-w-6 items-center justify-center rounded px-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}
