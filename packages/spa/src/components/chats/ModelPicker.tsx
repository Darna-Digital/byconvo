/**
 * The composer's model picker — a popover with a provider rail on the left
 * (favorites first), a search box, and the model list with ⌘1–9 shortcuts and
 * star toggles (t3code's ProviderModelPicker, sized down to our catalog).
 * Favorites persist in ui-prefs.
 */
import {
  IconChevronDown,
  IconSearch,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { ChatModelCatalog, ChatProviderKind } from "@/lib/api/types"
import { setUiPrefs, useUiPrefs } from "@/lib/ui-prefs"
import { cn } from "@/lib/utils"
import { ProviderIcon } from "./provider-icons"

interface PickerModel {
  readonly id: string
  readonly label: string
  readonly provider: ChatProviderKind
  readonly providerLabel: string
}

const FAVORITES_RAIL = "favorites"

export function ModelPicker({
  catalog,
  model,
  onSelect,
}: {
  catalog: ChatModelCatalog | undefined
  model: string
  onSelect: (model: string, provider: ChatProviderKind) => void
}) {
  const [open, setOpen] = useState(false)
  const [rail, setRail] = useState<string>(FAVORITES_RAIL)
  const [search, setSearch] = useState("")
  const favorites = useUiPrefs().chatModelFavorites

  const allModels: PickerModel[] = useMemo(
    () =>
      (catalog?.providers ?? []).flatMap((p) =>
        p.models.map((m) => ({
          id: m.id,
          label: m.label,
          provider: p.id,
          providerLabel: p.label,
        }))
      ),
    [catalog]
  )
  const current = allModels.find((m) => m.id === model)

  const visible = useMemo(() => {
    const inRail =
      rail === FAVORITES_RAIL
        ? allModels.filter((m) => favorites.includes(m.id))
        : allModels.filter((m) => m.provider === rail)
    // An empty favorites rail falls back to everything, so the picker never
    // opens onto a blank list.
    const base = inRail.length > 0 ? inRail : allModels
    const query = search.trim().toLowerCase()
    return query.length === 0
      ? base
      : base.filter((m) => m.label.toLowerCase().includes(query))
  }, [allModels, favorites, rail, search])

  const toggleFavorite = (id: string) => {
    setUiPrefs({
      chatModelFavorites: favorites.includes(id)
        ? favorites.filter((f) => f !== id)
        : [...favorites, id],
    })
  }

  const pick = (m: PickerModel) => {
    onSelect(m.id, m.provider)
    setOpen(false)
  }

  // ⌘1–9 (or Ctrl on non-mac) picks the nth visible model while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const m = visible[n - 1]
      if (m !== undefined) {
        e.preventDefault()
        pick(m)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs font-medium"
            aria-label="Choose model"
          />
        }
      >
        <ProviderIcon
          provider={current?.provider ?? "claude"}
          className="size-3.5"
        />
        <span className="max-w-40 truncate">
          {current?.label ?? (model.length > 0 ? model : "Model")}
        </span>
        <IconChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-96 gap-0 rounded-2xl p-0"
      >
        <div className="flex">
          {/* Provider rail */}
          <div className="flex flex-col items-center gap-1 border-r p-2">
            <button
              type="button"
              aria-label="Favorites"
              onClick={() => setRail(FAVORITES_RAIL)}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
                rail === FAVORITES_RAIL && "bg-muted text-foreground"
              )}
            >
              <IconStarFilled className="size-4.5" />
            </button>
            {(catalog?.providers ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.label}
                title={p.label}
                onClick={() => setRail(p.id)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg hover:bg-muted",
                  rail === p.id && "bg-muted"
                )}
              >
                <ProviderIcon provider={p.id} className="size-4.5" />
              </button>
            ))}
          </div>
          {/* Search + model list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <IconSearch className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {visible.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No models match.
                </p>
              )}
              {visible.map((m, index) => {
                const starred = favorites.includes(m.id)
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group/model flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted",
                      m.id === model && "bg-muted/60"
                    )}
                    onClick={() => pick(m)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{m.label}</span>
                        {m.id === model && (
                          <span className="text-primary">✓</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ProviderIcon
                          provider={m.provider}
                          className="size-3"
                        />
                        {m.providerLabel}
                      </div>
                    </div>
                    {index < 9 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        ⌘{index + 1}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={starred ? "Unstar model" : "Star model"}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(m.id)
                      }}
                      className={cn(
                        "text-muted-foreground opacity-0 transition-opacity group-hover/model:opacity-100 hover:text-foreground",
                        starred && "opacity-100"
                      )}
                    >
                      {starred ? (
                        <IconStarFilled className="size-3.5 text-amber-400" />
                      ) : (
                        <IconStar className="size-3.5" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
