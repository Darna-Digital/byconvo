/**
 * Terminal — a live, interactive terminal backed by a real PTY on the server,
 * rendered with xterm.js and streamed both ways over the PTY WebSocket.
 *
 * The xterm instance, its WebSocket, and its host element live in a module-level
 * registry keyed by thread id — deliberately OUTSIDE React state — so a session
 * survives the React component unmounting. That is what lets a thread keep
 * running, fully intact and still connected, when you navigate to another part of
 * the app (the commit view, docs, …) and come back, or switch between threads:
 * there is no teardown, reconnect, or scrollback replay at all. The React
 * component is just a mount point — it adopts the registry's host element while
 * shown and detaches it (keeping it alive) when hidden or unmounted.
 *
 * A session is only torn down when its thread is closed (disposeLiveTerminal) or
 * the page fully reloads — and on reload the server keeps the PTY alive and
 * replays the scrollback when the new page reconnects (see pty-socket.ts).
 */
import { useEffect, useRef, useState } from "react"
import { ptySocketUrl } from "@/lib/api/client"
import type { AgentKind } from "@/lib/api/types"
import "@xterm/xterm/css/xterm.css"

type Theme = "light" | "dark"
type Status = "connecting" | "open" | "closed"

/** A terminal session that outlives any single React mount. */
interface LiveTerminal {
  readonly host: HTMLDivElement
  status: Status
  error: string | null
  /** Last xterm title, replayed to a re-mounting view so the sidebar stays right. */
  lastTitle: string | null
  onState: ((s: { status: Status; error: string | null }) => void) | null
  onTitle: ((title: string) => void) | null
  onBell: (() => void) | null
  fit: () => void
  focus: () => void
  resize: () => void
  setTheme: (theme: Theme) => void
  dispose: () => void
}

const registry = new Map<string, LiveTerminal>()

const themeColors = (theme: Theme) =>
  theme === "dark"
    ? { background: "#0a0a0a", foreground: "#e5e5e5", cursor: "#e5e5e5" }
    : { background: "#ffffff", foreground: "#171717", cursor: "#171717" }

/**
 * Get (or lazily create) the persistent terminal for a thread. Creating one
 * spins up its xterm + PTY WebSocket once; both then stay alive in the registry
 * until disposeLiveTerminal or a full page reload.
 */
const ensureLiveTerminal = (
  id: string,
  agent: AgentKind,
  theme: Theme
): LiveTerminal => {
  const existing = registry.get(id)
  if (existing !== undefined) return existing

  const host = document.createElement("div")
  host.className = "h-full w-full"
  const live: LiveTerminal = {
    host,
    status: "connecting",
    error: null,
    lastTitle: null,
    onState: null,
    onTitle: null,
    onBell: null,
    fit: () => {},
    focus: () => {},
    resize: () => {},
    setTheme: () => {},
    dispose: () => {},
  }
  registry.set(id, live)

  const setStatus = (status: Status) => {
    live.status = status
    live.onState?.({ status, error: live.error })
  }
  const setError = (error: string) => {
    live.error = error
    live.onState?.({ status: live.status, error })
  }

  // The engine is imported lazily so it never runs during SSR/prerender.
  void (async () => {
    const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ])
    if (registry.get(id) !== live) return // disposed before the engine loaded

    const term = new XTerm({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme: themeColors(theme),
    })
    const fit = new FitAddon()
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

    const ws = new WebSocket(
      ptySocketUrl({ id, agent, cols: term.cols, rows: term.rows })
    )
    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ r: { cols: term.cols, rows: term.rows } }))
    }
    ws.onopen = () => {
      setStatus("open")
      sendResize()
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (typeof msg.d === "string") term.write(msg.d)
        else if (typeof msg.error === "string") setError(msg.error)
        else if (msg.exit !== undefined)
          term.write(`\r\n\x1b[90m[process exited: ${msg.exit}]\x1b[0m\r\n`)
      } catch {
        // ignore malformed frames
      }
    }
    ws.onclose = () => setStatus("closed")
    ws.onerror = () => setError("connection failed")

    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ d: data }))
    })
    const titleSub = term.onTitleChange((t) => {
      live.lastTitle = t
      live.onTitle?.(t)
    })
    const bellSub = term.onBell(() => live.onBell?.())

    const observer = new ResizeObserver(() => {
      safeFit()
      sendResize()
    })
    observer.observe(host)

    live.fit = safeFit
    live.focus = () => term.focus()
    live.resize = sendResize
    live.setTheme = (next) => {
      term.options.theme = themeColors(next)
    }
    live.dispose = () => {
      observer.disconnect()
      dataSub.dispose()
      titleSub.dispose()
      bellSub.dispose()
      try {
        ws.close()
      } catch {
        // already closing
      }
      term.dispose()
      host.remove()
    }
    safeFit()
    sendResize()
  })()

  return live
}

/** Tear down a thread's live terminal — call this when the thread is closed. */
export const disposeLiveTerminal = (id: string): void => {
  const live = registry.get(id)
  if (live === undefined) return
  registry.delete(id)
  live.dispose()
}

export function Terminal({
  id,
  agent,
  active,
  resolvedTheme,
  onTitle,
  onBell,
}: {
  /** Thread id — keys the persistent session in the registry (and on the server). */
  id: string
  agent: AgentKind
  active: boolean
  resolvedTheme: Theme
  onTitle?: (title: string) => void
  onBell?: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<Status>("connecting")
  const [error, setError] = useState<string | null>(null)

  // Adopt (or create) the persistent terminal for this thread and attach its host
  // element. On unmount we detach the host but keep the session alive.
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const live = ensureLiveTerminal(id, agent, resolvedTheme)

    live.onTitle = onTitle ?? null
    live.onBell = onBell ?? null
    live.onState = ({ status: s, error: e }) => {
      setStatus(s)
      setError(e)
    }
    // Reflect whatever state the session reached while it was detached.
    setStatus(live.status)
    setError(live.error)
    if (live.lastTitle !== null) onTitle?.(live.lastTitle)

    container.appendChild(live.host)
    const raf = requestAnimationFrame(() => {
      live.fit()
      live.resize()
      if (active) live.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      live.onTitle = null
      live.onBell = null
      live.onState = null
      // Detach but keep the session alive. (React also removes `container`;
      // pulling the host out first guarantees it isn't torn down with it.)
      if (live.host.parentNode === container) container.removeChild(live.host)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, agent])

  // Re-fit + focus when this terminal becomes the active one (it may have been
  // sized while hidden, or just re-attached after navigating back).
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      const live = registry.get(id)
      live?.fit()
      live?.resize()
      live?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [id, active])

  // Apply theme changes live without tearing down the PTY.
  useEffect(() => {
    registry.get(id)?.setTheme(resolvedTheme)
  }, [id, resolvedTheme])

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error !== null ? (
        <div className="absolute inset-x-0 bottom-0 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      ) : (
        status !== "open" && (
          <div className="absolute top-2 right-2 text-xs text-muted-foreground">
            {status === "connecting" ? "connecting…" : "disconnected"}
          </div>
        )
      )}
    </div>
  )
}
