import { useCallback, useMemo, useState } from "react"
import { createBranchTreeFunctions } from "../functions/branch-tree.functions"

const FAV_KEY = "byconvo-fav-branches"

const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return new Set(raw ? (JSON.parse(raw) as Array<string>) : [])
  } catch {
    return new Set()
  }
}

/**
 * Branch-tree shaping (pure functions) plus the stateful bits the panel needs:
 * favourites persisted to localStorage and the expand/collapse state. The tree
 * building itself stays in the functions layer; only persistence is wired here.
 */
export function useBranchTree() {
  const functions = useMemo(
    () => createBranchTreeFunctions({ data: {}, sideEffects: {} }),
    []
  )

  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["__local", "__remote"])
  )

  const toggleFavorite = useCallback(
    (name: string) =>
      setFavorites((current) => {
        const next = functions.toggleFavorite(current, name)
        try {
          localStorage.setItem(FAV_KEY, JSON.stringify([...next]))
        } catch {
          // Persistence is best-effort; ignore quota/availability errors.
        }
        return next
      }),
    [functions]
  )

  const toggleFolder = useCallback(
    (path: string) =>
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      }),
    []
  )

  return { functions, favorites, expanded, toggleFavorite, toggleFolder }
}
