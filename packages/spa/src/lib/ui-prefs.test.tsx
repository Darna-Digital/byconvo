// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Theme } from "./ui-prefs"

import { setUiPrefs, useUiPrefs } from "./ui-prefs"

// A controllable matchMedia mock, installed before the store module loads so
// its top-level load()/listener registration see it. `fire()` simulates the OS
// flipping its appearance and notifies the registered "change" listeners.
const mql = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const sys = { dark: false }
  ;(globalThis as unknown as { matchMedia: unknown }).matchMedia = (
    query: string
  ) => ({
    matches: query.includes("dark") ? sys.dark : false,
    media: query,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) =>
      listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
    onchange: null,
  })
  return {
    fire(dark: boolean) {
      sys.dark = dark
      for (const l of listeners) l()
    },
    reset() {
      sys.dark = false
    },
  }
})

afterEach(() => mql.reset())

// Records the resolvedTheme captured at each render. We assert on captured
// values rather than reading the live store, because the store object is
// mutated in place — reading it directly would see the new value even if React
// never re-rendered, which is exactly the bug. Pierre's FileDiff only gets a
// fresh themeType prop when a render actually occurs.
function Probe({ seen }: { seen: Theme[] }) {
  const prefs = useUiPrefs()
  seen.push(prefs.resolvedTheme)
  return null
}

describe("useUiPrefs system theme sync", () => {
  it("re-renders consumers when the OS theme changes in system mode", () => {
    act(() => setUiPrefs({ theme: "system" }))
    mql.reset()

    const seen: Theme[] = []
    act(() => void render(<Probe seen={seen} />))
    expect(seen).toEqual(["light"])

    // The OS flips to dark. This must trigger a re-render so consumers reading
    // resolvedTheme through a prop (e.g. pierre's FileDiff themeType) get the
    // new value. The regression: an in-place mutation kept the snapshot
    // identity stable, so useSyncExternalStore bailed out and never re-rendered.
    act(() => mql.fire(true))
    expect(seen.at(-1)).toBe("dark")

    act(() => mql.fire(false))
    expect(seen.at(-1)).toBe("light")
  })

  it("ignores OS changes when a concrete theme is pinned", () => {
    act(() => setUiPrefs({ theme: "light" }))

    const seen: Theme[] = []
    act(() => void render(<Probe seen={seen} />))
    expect(seen).toEqual(["light"])

    act(() => mql.fire(true))
    expect(seen.at(-1)).toBe("light")
  })
})
