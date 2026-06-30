/**
 * DevTerminal — an xterm.js view onto a Local Dev command's server-side process,
 * streamed over the `/api/local-dev/pty` WebSocket. The process itself is owned
 * by the server's DevProcessManager and keeps running independently of this
 * socket: mounting attaches and replays scrollback, unmounting only detaches.
 * The engine is imported lazily so it never runs during SSR/prerender. Mount one
 * per command (keyed by id); `onExit` lets the page refresh the command's status.
 *
 * The xterm wiring deliberately mirrors components/threads/Terminal.tsx; once the
 * terminal-threads work settles the two could share a hook.
 */
import { useEffect, useRef, useState } from "react"
import { devPtySocketUrl } from "@/lib/api/client"
import { mountTerminal, type TerminalTheme } from "@/lib/terminal/xterm-engine"
import "@xterm/xterm/css/xterm.css"

interface TerminalHandles {
  fit: () => void
  focus: () => void
  resize: () => void
  setTheme: (theme: TerminalTheme) => void
}

export function DevTerminal({
  commandId,
  active,
  resolvedTheme,
  onExit,
}: {
  /** Dev command id — selects the server-side process to attach to. */
  commandId: string
  active: boolean
  resolvedTheme: TerminalTheme
  /** Called when the process exits, so the page can refresh its status. */
  onExit?: (exitCode: number) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const handlesRef = useRef<TerminalHandles | null>(null)
  const [status, setStatus] = useState<"connecting" | "open" | "closed">(
    "connecting"
  )
  const [error, setError] = useState<string | null>(null)

  // Mount the engine + attach once per command.
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let disposed = false
    let cleanup = () => {}

    void (async () => {
      const mounted = await mountTerminal(host, resolvedTheme)
      if (disposed) {
        mounted.dispose()
        return
      }
      const { term, safeFit } = mounted

      const ws = new WebSocket(
        devPtySocketUrl({
          command: commandId,
          cols: term.cols,
          rows: term.rows,
        })
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
          else if (msg.exit !== undefined) {
            term.write(`\r\n\x1b[90m[process exited: ${msg.exit}]\x1b[0m\r\n`)
            onExit?.(Number(msg.exit))
          }
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
        safeFit()
        sendResize()
      })
      observer.observe(host)

      handlesRef.current = {
        fit: safeFit,
        focus: () => term.focus(),
        resize: sendResize,
        setTheme: (theme) => mounted.setTheme(theme),
      }

      cleanup = () => {
        handlesRef.current = null
        observer.disconnect()
        dataSub.dispose()
        ws.close()
        mounted.dispose()
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandId])

  // Re-fit + focus when this terminal becomes the active one.
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      handlesRef.current?.fit()
      handlesRef.current?.resize()
      handlesRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  // Apply theme changes live without tearing down the connection.
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
