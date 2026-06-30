/**
 * Shared xterm.js engine — one place that creates and configures every terminal
 * in the app (the thread terminals in components/threads/Terminal.tsx and the
 * Local Dev terminals in components/local-dev/DevTerminal.tsx), so they render
 * identically. Both used to inline a bare xterm with only the FitAddon and the
 * default DOM renderer; agent TUIs (Claude Code / opencode / Codex) repaint a
 * full screen many times a second and the DOM renderer flickers, shears the cell
 * grid and leaves artifacts under that load — "agents render broken."
 *
 * This mirrors how Hyper and VS Code (whose team builds xterm.js) render their
 * terminals:
 *   - a GPU renderer (@xterm/addon-webgl) for a pixel-perfect, flicker-free cell
 *     grid, with a graceful fall back to the Canvas renderer and finally the DOM
 *     renderer when WebGL2 is unavailable or its context is lost;
 *   - Unicode 11 width tables (@xterm/addon-unicode11) so box-drawing glyphs,
 *     emoji and powerline symbols occupy the right number of cells instead of
 *     shearing the layout;
 *   - clickable URLs (@xterm/addon-web-links);
 *   - a complete, theme-matched 16-colour ANSI palette for both light and dark
 *     (xterm's built-in palette is tuned for a black background, so on the app's
 *     light theme the default blues/yellows/bright-white were near-invisible).
 *
 * The engine is imported lazily by callers so xterm never runs during
 * SSR/prerender.
 */
import type { ITheme, Terminal as XTermTerminal } from "@xterm/xterm"
import type { FitAddon } from "@xterm/addon-fit"

export type TerminalTheme = "light" | "dark"

/**
 * Full ANSI palette per theme. The 16 colours are Tailwind hues (the app's own
 * palette) picked to stay legible on each background, plus a matching selection
 * tint and a cursor-accent that reads against the cursor block.
 */
const THEMES: Record<TerminalTheme, ITheme> = {
  dark: {
    background: "#0a0a0a",
    foreground: "#e5e5e5",
    cursor: "#e5e5e5",
    cursorAccent: "#0a0a0a",
    selectionBackground: "#ffffff40",
    black: "#2b2b2b",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#d4d4d4",
    brightBlack: "#737373",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde047",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#fafafa",
  },
  light: {
    background: "#ffffff",
    foreground: "#171717",
    cursor: "#171717",
    cursorAccent: "#ffffff",
    selectionBackground: "#00000026",
    black: "#1f2937",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#b45309",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#6b7280",
    brightBlack: "#4b5563",
    brightRed: "#ef4444",
    brightGreen: "#15803d",
    brightYellow: "#a16207",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#0e7490",
    brightWhite: "#111827",
  },
}

export const terminalTheme = (theme: TerminalTheme): ITheme => THEMES[theme]

/** Base xterm options shared by every terminal in the app. */
const baseOptions = (theme: TerminalTheme) =>
  ({
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace',
    fontSize: 12,
    // Exact 1.0 keeps box-drawing rows seamless (any inter-row gap shows as
    // hairline seams through an agent's borders).
    lineHeight: 1.0,
    cursorBlink: true,
    // Required by the Unicode 11 addon's width provider.
    allowProposedApi: true,
    // Keep bold text bold without silently remapping it to the bright palette,
    // which muddies an agent TUI's deliberate colour choices.
    drawBoldTextInBrightColors: false,
    // Nudge unreadable color-on-color combos toward legibility (1 = off). A
    // gentle floor rescues e.g. dim grey-on-grey status lines without distorting
    // the palette the way a high ratio would.
    minimumContrastRatio: 1.1,
    theme: terminalTheme(theme),
  }) as const

/**
 * Attach the best available renderer: WebGL2 → Canvas → DOM (the built-in
 * default). The WebGL context can be lost (GPU reset, tab backgrounded for a
 * long time); when that happens we dispose the addon, which makes xterm fall
 * back to the DOM renderer rather than freeze on a dead canvas. Best-effort:
 * every step is guarded so a terminal always renders, just less fast.
 */
const attachRenderer = async (term: XTermTerminal): Promise<() => void> => {
  try {
    const { WebglAddon } = await import("@xterm/addon-webgl")
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => {
      try {
        webgl.dispose()
      } catch {
        // already disposed
      }
    })
    term.loadAddon(webgl)
    return () => {
      try {
        webgl.dispose()
      } catch {
        // already disposed
      }
    }
  } catch {
    // WebGL2 unavailable — try the Canvas renderer before the DOM default.
    try {
      const { CanvasAddon } = await import("@xterm/addon-canvas")
      const canvas = new CanvasAddon()
      term.loadAddon(canvas)
      return () => {
        try {
          canvas.dispose()
        } catch {
          // already disposed
        }
      }
    } catch {
      // Fall through to xterm's built-in DOM renderer.
      return () => {}
    }
  }
}

export interface MountedTerminal {
  readonly term: XTermTerminal
  readonly fit: FitAddon
  /** Fit to the host, but only when it has a non-zero box (avoids throwing while
   * detached). */
  readonly safeFit: () => void
  /** Swap the live theme without tearing down the PTY. */
  readonly setTheme: (theme: TerminalTheme) => void
  /** Dispose every addon and the terminal (does not touch the host element). */
  readonly dispose: () => void
}

/**
 * Create a fully-configured xterm, open it on `host`, and load the fit, Unicode
 * 11, web-links and renderer addons. Returns handles the caller wires to its own
 * PTY WebSocket. The renderer/Unicode/links addons load after `open()` (the
 * renderer requires it); the terminal is already usable before they resolve.
 */
export const mountTerminal = async (
  host: HTMLElement,
  theme: TerminalTheme
): Promise<MountedTerminal> => {
  const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ])

  const term = new XTerm(baseOptions(theme))
  const fit = new Fit()
  term.loadAddon(fit)
  term.open(host)

  const safeFit = () => {
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      try {
        fit.fit()
      } catch {
        // host detaching
      }
    }
  }
  safeFit()

  const disposers: Array<() => void> = []

  // Unicode 11 width tables — load and activate so wide glyphs measure right.
  try {
    const { Unicode11Addon } = await import("@xterm/addon-unicode11")
    const unicode = new Unicode11Addon()
    term.loadAddon(unicode)
    term.unicode.activeVersion = "11"
    disposers.push(() => {
      try {
        unicode.dispose()
      } catch {
        // already disposed
      }
    })
  } catch {
    // optional — fall back to the built-in Unicode 6 widths
  }

  // Clickable URLs printed by agents/dev servers.
  try {
    const { WebLinksAddon } = await import("@xterm/addon-web-links")
    const links = new WebLinksAddon()
    term.loadAddon(links)
    disposers.push(() => {
      try {
        links.dispose()
      } catch {
        // already disposed
      }
    })
  } catch {
    // optional
  }

  disposers.push(await attachRenderer(term))

  return {
    term,
    fit,
    safeFit,
    setTheme: (next) => {
      term.options.theme = terminalTheme(next)
    },
    dispose: () => {
      for (const d of disposers) d()
      term.dispose()
    },
  }
}
