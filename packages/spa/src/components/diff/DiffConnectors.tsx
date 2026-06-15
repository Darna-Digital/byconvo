import { useCallback, useLayoutEffect, useRef, useState } from "react"

/**
 * JetBrains-style connector ribbons for Pierre split diffs. Pierre renders the
 * split view as a two-column grid inside a `<diffs-container>` shadow root; we
 * widen the seam (via the FileDiff `unsafeCSS` option) and paint filled bézier
 * ribbons into it, linking each change band's deletions (left) to additions
 * (right). Ported from the original client.
 */
type RibbonKind = "add" | "del" | "mod"

interface Ribbon {
  kind: RibbonKind
  leftTop: number
  leftBottom: number
  rightTop: number
  rightBottom: number
}

interface Geometry {
  width: number
  height: number
  stripLeft: number
  stripRight: number
  ribbons: ReadonlyArray<Ribbon>
}

interface Band {
  top: number
  bottom: number
}

const rowRects = (
  column: Element,
  selector: string,
  originTop: number
): Array<Band> =>
  Array.from(column.querySelectorAll(selector)).map((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top - originTop, bottom: rect.bottom - originTop }
  })

const toBands = (rows: ReadonlyArray<Band>): Array<Band> => {
  const sorted = [...rows].sort((a, b) => a.top - b.top)
  const bands: Array<Band> = []
  for (const row of sorted) {
    const last = bands[bands.length - 1]
    if (last !== undefined && row.top <= last.bottom + 1) {
      last.bottom = Math.max(last.bottom, row.bottom)
    } else {
      bands.push({ top: row.top, bottom: row.bottom })
    }
  }
  return bands
}

const spanWithin = (rows: ReadonlyArray<Band>, band: Band): Band | null => {
  const inside = rows.filter(
    (row) => row.bottom > band.top && row.top < band.bottom
  )
  if (inside.length === 0) return null
  return {
    top: Math.min(...inside.map((row) => row.top)),
    bottom: Math.max(...inside.map((row) => row.bottom)),
  }
}

const measure = (section: HTMLElement): Geometry | null => {
  const host = section.querySelector("diffs-container")
  const root = host?.shadowRoot
  if (root == null) return null
  const deletions = root.querySelector("[data-deletions]")
  const additions = root.querySelector("[data-additions]")
  if (deletions == null || additions == null) return null

  const base = section.getBoundingClientRect()
  const delRect = deletions.getBoundingClientRect()
  const addRect = additions.getBoundingClientRect()
  const stripLeft = delRect.right - base.left
  const stripRight = addRect.left - base.left
  if (stripRight - stripLeft < 2) return null

  const delChanges = rowRects(
    deletions,
    '[data-line-type="change-deletion"]',
    base.top
  )
  const addChanges = rowRects(
    additions,
    '[data-line-type="change-addition"]',
    base.top
  )
  const buffers = [
    ...rowRects(deletions, "[data-gutter-buffer]", base.top),
    ...rowRects(additions, "[data-gutter-buffer]", base.top),
  ]

  const ribbons: Array<Ribbon> = []
  for (const band of toBands([...delChanges, ...addChanges, ...buffers])) {
    const left = spanWithin(delChanges, band)
    const right = spanWithin(addChanges, band)
    if (left == null && right == null) continue
    const mid = (band.top + band.bottom) / 2
    const kind: RibbonKind =
      left == null ? "add" : right == null ? "del" : "mod"
    ribbons.push({
      kind,
      leftTop: left?.top ?? mid,
      leftBottom: left?.bottom ?? mid,
      rightTop: right?.top ?? mid,
      rightBottom: right?.bottom ?? mid,
    })
  }

  return {
    width: base.width,
    height: base.height,
    stripLeft,
    stripRight,
    ribbons,
  }
}

const ribbonPath = (
  ribbon: Ribbon,
  stripLeft: number,
  stripRight: number
): string => {
  const mid = (stripLeft + stripRight) / 2
  const { leftTop, leftBottom, rightTop, rightBottom } = ribbon
  return (
    `M ${stripLeft} ${leftTop} ` +
    `C ${mid} ${leftTop}, ${mid} ${rightTop}, ${stripRight} ${rightTop} ` +
    `L ${stripRight} ${rightBottom} ` +
    `C ${mid} ${rightBottom}, ${mid} ${leftBottom}, ${stripLeft} ${leftBottom} Z`
  )
}

/** Width of the seam opened between the two columns (also injected via unsafeCSS). */
export const CONNECTOR_GUTTER = 30
export const connectorGutterCSS = `pre { column-gap: ${CONNECTOR_GUTTER}px; }`

interface DiffConnectorsProps {
  section: HTMLElement | null
  recomputeRef: React.RefObject<() => void>
  enabled: boolean
}

export function DiffConnectors({
  section,
  recomputeRef,
  enabled,
}: DiffConnectorsProps) {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const loop = useRef<number | null>(null)

  const schedule = useCallback(() => {
    if (loop.current != null) cancelAnimationFrame(loop.current)
    let prevSig = ""
    let stable = 0
    let frames = 0
    const tick = () => {
      loop.current = null
      if (!enabled || section == null) {
        setGeometry(null)
        return
      }
      let geo: Geometry | null = null
      try {
        const root = section.querySelector("diffs-container")?.shadowRoot
        root
          ?.querySelectorAll("[data-deletions],[data-additions]")
          .forEach((column) => {
            observer.current?.observe(column)
          })
        geo = measure(section)
      } catch {
        geo = null
      }
      const sig = geo
        ? `${geo.width}|${geo.stripLeft}|${geo.stripRight}|${geo.ribbons.length}`
        : "∅"
      if (sig !== prevSig) {
        setGeometry(geo)
        prevSig = sig
        stable = 0
      } else {
        stable += 1
      }
      if (stable < 2 && frames++ < 24)
        loop.current = requestAnimationFrame(tick)
    }
    loop.current = requestAnimationFrame(tick)
  }, [enabled, section])

  useLayoutEffect(() => {
    recomputeRef.current = schedule
    return () => {
      recomputeRef.current = () => {}
    }
  }, [schedule, recomputeRef])

  useLayoutEffect(() => {
    if (!enabled || section == null) {
      setGeometry(null)
      return
    }
    const resize = new ResizeObserver(schedule)
    observer.current = resize
    resize.observe(section)
    const host = section.querySelector("diffs-container")
    if (host != null) resize.observe(host)
    schedule()
    window.addEventListener("resize", schedule)
    const scroller = section.closest(".diff-pane")
    const onScroll = () => {
      const rect = section.getBoundingClientRect()
      if (rect.bottom > 0 && rect.top < window.innerHeight) schedule()
    }
    scroller?.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      resize.disconnect()
      observer.current = null
      window.removeEventListener("resize", schedule)
      scroller?.removeEventListener("scroll", onScroll)
      if (loop.current != null) {
        cancelAnimationFrame(loop.current)
        loop.current = null
      }
    }
  }, [enabled, schedule, section])

  if (geometry == null || geometry.ribbons.length === 0) return null

  return (
    <svg
      className="diff-connectors"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      aria-hidden
    >
      {geometry.ribbons.map((ribbon, index) => (
        <path
          key={index}
          className={`cx-${ribbon.kind}`}
          d={ribbonPath(ribbon, geometry.stripLeft, geometry.stripRight)}
        />
      ))}
    </svg>
  )
}
