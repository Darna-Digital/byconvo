/**
 * Bridge to the Electron desktop shell, exposed on `window.codediff` by the
 * preload script (see packages/desktop/src/preload.ts). It is absent when the
 * client runs in a plain browser, so callers must null-check `desktop`.
 */
interface DesktopBridge {
  /** Show the native folder picker; resolves to the chosen path or null. */
  openDirectory: () => Promise<string | null>
}

declare global {
  interface Window {
    codediff?: DesktopBridge
  }
}

export const desktop: DesktopBridge | null =
  typeof window !== "undefined" && window.codediff ? window.codediff : null
