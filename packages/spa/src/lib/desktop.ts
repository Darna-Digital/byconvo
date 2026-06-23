/**
 * Desktop-shell detection.
 *
 * The Electron preload bridge injects `window.byconvo` (see
 * packages/desktop/src/preload.ts). When present we're running inside the
 * native window, where the macOS traffic lights sit over the top-left of the
 * web content (`titleBarStyle: "hiddenInset"`) — the top bar reserves space for
 * them. In the plain browser the bridge is absent and no space is reserved.
 *
 * SPA-only (no SSR), so reading `window` at module load is safe.
 */
type ByconvoWindow = Window & {
  byconvo?: {
    apiBaseUrl?: string
    openDirectory: () => Promise<string | null>
  }
}

export const isDesktop =
  typeof window !== "undefined" && "byconvo" in (window as ByconvoWindow)

export async function openDesktopDirectory(): Promise<string | null> {
  if (!isDesktop) return null
  return (window as ByconvoWindow).byconvo?.openDirectory() ?? null
}
