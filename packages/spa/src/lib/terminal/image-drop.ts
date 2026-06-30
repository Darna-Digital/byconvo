/**
 * Drag-and-drop image support for a terminal host, matching what the Claude Code
 * CLI does in a native terminal: drop an image and its path is handed to the
 * program. In the browser there is no local path to insert, so instead we ship
 * the image bytes to the server over the existing PTY socket; the server writes
 * them to a temp file and types that path into the PTY (see pty-socket.ts). The
 * agent then reads the image exactly as if a path had been dragged in natively.
 */
import { toast } from "sonner"

/** Reject anything larger than this so a stray huge file can't wedge the socket. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export interface ImageDropOptions {
  /** The live PTY socket, or null while connecting/closed. */
  readonly getSocket: () => WebSocket | null
  /** Called as the user drags over / leaves, so the host can show an overlay. */
  readonly onDragState?: (dragging: boolean) => void
}

const isImage = (file: File): boolean => file.type.startsWith("image/")

const readAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      // Strip the "data:<mime>;base64," prefix — the server wants raw base64.
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })

/**
 * Wire drag-and-drop image handling onto `host`. Returns a cleanup function that
 * removes every listener.
 */
export const attachImageDrop = (
  host: HTMLElement,
  options: ImageDropOptions
): (() => void) => {
  // dragenter/dragleave fire per descendant, so count depth to know when the
  // pointer has truly left the host.
  let depth = 0
  const setDragging = (dragging: boolean) => options.onDragState?.(dragging)

  const hasFiles = (e: DragEvent): boolean =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files")

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth += 1
    setDragging(true)
  }
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
  }
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setDragging(false)
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    setDragging(false)

    const files = Array.from(e.dataTransfer?.files ?? [])
    const images = files.filter(isImage)
    if (images.length === 0) {
      if (files.length > 0) toast.error("Only image files can be dropped here")
      return
    }
    void (async () => {
      for (const file of images) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name || "image"} is too large (max 15 MB)`)
          continue
        }
        const socket = options.getSocket()
        if (socket === null || socket.readyState !== WebSocket.OPEN) {
          toast.error("Terminal is not connected")
          return
        }
        try {
          const data = await readAsBase64(file)
          socket.send(JSON.stringify({ img: { name: file.name, data } }))
        } catch {
          toast.error(`Could not read ${file.name || "image"}`)
        }
      }
    })()
  }

  host.addEventListener("dragenter", onDragEnter)
  host.addEventListener("dragover", onDragOver)
  host.addEventListener("dragleave", onDragLeave)
  host.addEventListener("drop", onDrop)

  return () => {
    host.removeEventListener("dragenter", onDragEnter)
    host.removeEventListener("dragover", onDragOver)
    host.removeEventListener("dragleave", onDragLeave)
    host.removeEventListener("drop", onDrop)
  }
}
