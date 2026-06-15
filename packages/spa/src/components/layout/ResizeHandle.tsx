/**
 * ResizeHandle — a custom, dependency-free drag handle for resizing a panel.
 *
 * shadcn's resizable (react-resizable-panels) fights our flex/route-driven
 * layout, so — like the old client package — we roll our own: a thin divider
 * that owns the pointer-drag math and reports the new panel size back to the
 * parent, which keeps the size in state. The parent stays the source of truth;
 * the handle is purely the gesture.
 */
import { useCallback, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "@/lib/utils"

interface ResizeHandleProps {
  /**
   * "col" → a vertical divider dragged horizontally (col-resize).
   * "row" → a horizontal divider dragged vertically (row-resize).
   */
  orientation: "col" | "row"
  /** Current panel size in px. Captured fresh at the start of each drag. */
  value: number
  /** Lower bound, in px. */
  min: number
  /** Upper bound, in px — a function so it can track the live viewport. */
  max: () => number
  /**
   * How a positive pointer delta (moving right / down) changes the size:
   * +1 when the handle sits on the panel's trailing edge (e.g. a left
   * sidebar's right edge), -1 when on its leading edge (e.g. a bottom
   * panel's top edge). Defaults to +1.
   */
  direction?: 1 | -1
  /** Called continuously during the drag with the clamped size. */
  onResize: (next: number) => void
  /** Called once when the drag ends with the final clamped size. */
  onResizeEnd?: (next: number) => void
  className?: string
  label?: string
}

export function ResizeHandle({
  orientation,
  value,
  min,
  max,
  direction = 1,
  onResize,
  onResizeEnd,
  className,
  label = "Resize panel",
}: ResizeHandleProps) {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault()
      const axis = orientation === "col" ? "clientX" : "clientY"
      const start = event[axis]
      const startSize = value
      const cursorClass =
        orientation === "col" ? "is-resizing-col" : "is-resizing-row"
      document.body.classList.add(cursorClass)

      let latest = startSize
      const onMove = (move: PointerEvent) => {
        const delta = (move[axis] - start) * direction
        latest = Math.min(Math.max(startSize + delta, min), max())
        onResize(latest)
      }
      const onUp = () => {
        document.body.classList.remove(cursorClass)
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        onResizeEnd?.(latest)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [orientation, value, min, max, direction, onResize, onResizeEnd]
  )

  return (
    <div
      role="separator"
      aria-orientation={orientation === "col" ? "vertical" : "horizontal"}
      aria-label={label}
      title="Drag to resize"
      onPointerDown={onPointerDown}
      className={cn(
        orientation === "col" ? "resize-handle-col" : "resize-handle-row",
        className
      )}
    />
  )
}
