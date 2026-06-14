/**
 * Ephemeral UI preferences — theme, diff rendering style, panel sizes. These
 * are genuinely-local view state (not navigation), so they live in a tiny
 * localStorage-backed store instead of the URL.
 */
import { useSyncExternalStore } from "react"

export type ThemePref = "light" | "dark" | "system"
export type Theme = "light" | "dark"
export type DiffStyle = "split" | "unified"

export interface UiPrefs {
  /** The user's choice; "system" follows the OS. */
  theme: ThemePref
  /** The concrete theme to render (system resolved against the OS). */
  resolvedTheme: Theme
  diffStyle: DiffStyle
  connectors: boolean
  bottomVisible: boolean
  /** Drag-resizable left sidebar width, in px. */
  sidebarWidth: number
  /** Drag-resizable bottom panel height, in px. */
  bottomHeight: number
}

const STORE_KEY = "reviewer-ui"
const THEME_KEY = "reviewer-theme"

const systemTheme = (): Theme =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"

const resolve = (pref: ThemePref): Theme => (pref === "system" ? systemTheme() : pref)

const defaults: Omit<UiPrefs, "resolvedTheme"> = {
  theme: "system",
  diffStyle: "split",
  connectors: true,
  bottomVisible: true,
  sidebarWidth: 288,
  bottomHeight: 256,
}

function load(): UiPrefs {
  let prefs = { ...defaults }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORE_KEY)
      if (raw !== null) prefs = { ...prefs, ...(JSON.parse(raw) as Partial<typeof defaults>) }
    } catch {
      // ignore malformed storage
    }
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") prefs.theme = stored
  }
  return { ...prefs, resolvedTheme: resolve(prefs.theme) }
}

let state: UiPrefs = load()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function persist() {
  if (typeof window === "undefined") return
  try {
    const { theme, diffStyle, connectors, bottomVisible, sidebarWidth, bottomHeight } = state
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ theme, diffStyle, connectors, bottomVisible, sidebarWidth, bottomHeight }),
    )
    window.localStorage.setItem(THEME_KEY, state.theme)
  } catch {
    // ignore quota errors
  }
}

function applyTheme() {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", state.resolvedTheme === "dark")
  document.documentElement.dataset["theme"] = state.resolvedTheme
}

export function setUiPrefs(patch: Partial<Omit<UiPrefs, "resolvedTheme">>) {
  state = { ...state, ...patch }
  if (patch.theme !== undefined) {
    state.resolvedTheme = resolve(patch.theme)
    applyTheme()
  }
  persist()
  emit()
}

const THEME_ORDER: ThemePref[] = ["light", "dark", "system"]
export function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length]!
  setUiPrefs({ theme: next })
}

// Track the OS theme so "system" updates live.
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") {
      state.resolvedTheme = systemTheme()
      applyTheme()
      emit()
    }
  })
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}
