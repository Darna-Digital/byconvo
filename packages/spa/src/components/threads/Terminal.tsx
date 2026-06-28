/**
 * Terminal — a live, interactive terminal backed by a real PTY on the server,
 * rendered with xterm.js and streamed both ways over the PTY WebSocket. This is
 * byconvo's web stand-in for embedding a native terminal (e.g. libghostty): the
 * server runs the PTY, xterm renders it in the browser.
 *
 * Like Zed's terminal threads, a terminal keeps running while another thread is
 * focused — so the host is hidden (not unmounted) when inactive, the session
 * stays alive, and it reports its live process title and bell activity to the
 * parent. The engine is imported lazily inside the effect so it never runs
 * during SSR/prerender. Mount one per thread (keyed by id).
 */
import { useEffect, useRef, useState } from "react"
import { ptySocketUrl } from "@/lib/api/client"
import type { AgentKind } from "@/lib/api/types"
import "@xterm/xterm/css/xterm.css"

interface TerminalHandles {
  fit: () => void
  focus: () => void
  resize: () => void
  setTheme: (theme: "light" | "dark") => void
}

const themeColors = (theme: "light" | "dark") =>
  theme === "dark"
    ? { background: "#0a0a0a", foreground: "#e5e5e5", cursor: "#e5e5e5" }
    : { background: "#ffffff", foreground: "#171717", cursor: "#171717" }

export function Terminal({
  agent,
  active,
  resolvedTheme,
  onTitle,
  onBell,
}: {
  agent: AgentKind
  active: boolean
  resolvedTheme: "light" | "dark"
  onTitle?: (title: string) => void
  onBell?: () => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const handlesRef = useRef<TerminalHandles | null>(null)
  const [status, setStatus] = useState<"connecting" | "open" | "closed">(
    "connecting"
  )
  const [error, setError] = useState<string | null>(null)

  // Mount the engine + PTY once per thread (agent is stable for a thread).
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let disposed = false
    let cleanup = () => {}

    void (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ])
      if (disposed) return

      const term = new XTerm({
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 12,
        cursorBlink: true,
        allowProposedApi: true,
        theme: themeColors(resolvedTheme),
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
        ptySocketUrl({ agent, cols: term.cols, rows: term.rows })
      )
      const sendResize = () => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ r: { cols: term.cols, rows: term.rows } }))
      }

      ws.onopen = () => {
        if (!disposed) setStatus("open")
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
      ws.onclose = () => {
        if (!disposed) setStatus("closed")
      }
      ws.onerror = () => {
        if (!disposed) setError("connection failed")
      }

      const dataSub = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ d: data }))
      })
      const titleSub = term.onTitleChange((t) => onTitle?.(t))
      const bellSub = term.onBell(() => onBell?.())

      const observer = new ResizeObserver(() => {
        safeFit()
        sendResize()
      })
      observer.observe(host)

      handlesRef.current = {
        fit: safeFit,
        focus: () => term.focus(),
        resize: sendResize,
        setTheme: (theme) => {
          term.options.theme = themeColors(theme)
        },
      }

      cleanup = () => {
        handlesRef.current = null
        observer.disconnect()
        dataSub.dispose()
        titleSub.dispose()
        bellSub.dispose()
        ws.close()
        term.dispose()
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent])

  // Re-fit + focus when this terminal becomes the active one (it may have been
  // sized while hidden). A frame's delay lets the host finish laying out.
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      handlesRef.current?.fit()
      handlesRef.current?.resize()
      handlesRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  // Apply theme changes live without tearing down the PTY.
  useEffect(() => {
    handlesRef.current?.setTheme(resolvedTheme)
  }, [resolvedTheme])

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={hostRef} className="h-full w-full" />
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
