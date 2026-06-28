/**
 * Terminal — a live, interactive terminal backed by a real PTY on the server.
 * Renders an xterm.js terminal and streams bytes both ways over the PTY
 * WebSocket. This is byconvo's web stand-in for embedding a native terminal
 * (e.g. libghostty): the server runs the PTY, xterm renders it in the browser.
 *
 * xterm touches the DOM at import time, so the engine is imported lazily inside
 * the effect (never during SSR/prerender). Mount one per thread (keyed by id).
 */
import { useEffect, useRef, useState } from "react"
import { ptySocketUrl } from "@/lib/api/client"
import type { AgentKind } from "@/lib/api/types"
import "@xterm/xterm/css/xterm.css"

export function Terminal({
  agent,
  resolvedTheme,
}: {
  agent: AgentKind
  resolvedTheme: "light" | "dark"
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<"connecting" | "open" | "closed">(
    "connecting"
  )
  const [error, setError] = useState<string | null>(null)

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
        theme:
          resolvedTheme === "dark"
            ? { background: "#0a0a0a", foreground: "#e5e5e5" }
            : { background: "#ffffff", foreground: "#171717" },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(host)
      fit.fit()

      const ws = new WebSocket(
        ptySocketUrl({ agent, cols: term.cols, rows: term.rows })
      )

      ws.onopen = () => {
        if (!disposed) setStatus("open")
        ws.send(JSON.stringify({ r: { cols: term.cols, rows: term.rows } }))
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

      const observer = new ResizeObserver(() => {
        try {
          fit.fit()
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ r: { cols: term.cols, rows: term.rows } }))
        } catch {
          // host may be detaching
        }
      })
      observer.observe(host)

      term.focus()

      cleanup = () => {
        observer.disconnect()
        dataSub.dispose()
        ws.close()
        term.dispose()
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
  }, [agent, resolvedTheme])

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
