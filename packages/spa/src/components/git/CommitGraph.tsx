import type { ReactElement } from "react"
import type {
  CommitGraphConfig,
  CommitGraphFunctions,
  GraphRow,
} from "@/features/commit-graph/entity/commit-graph.interfaces"

interface GraphCellProps {
  row: GraphRow
  width: number
  functions: CommitGraphFunctions
  config: CommitGraphConfig
}

/** Render one commit's graph cell: passing lanes, converging/branching edges, dot. */
export function GraphCell({ row, width, functions, config }: GraphCellProps) {
  const { centerX, edgePath } = functions
  const { colWidth, dotRadius, rowHeight } = config
  const w = Math.max(width, 1) * colWidth
  const mid = rowHeight / 2
  const lines: Array<ReactElement> = []

  row.before.forEach((lane, k) => {
    if (lane === null) return
    const toCol = lane.target === row.sha ? row.dotCol : k
    lines.push(
      <path
        key={`t${k}`}
        d={edgePath(centerX(k), 0, centerX(toCol), mid)}
        stroke={lane.color}
        fill="none"
        strokeWidth={1.5}
      />
    )
  })

  row.after.forEach((lane, k) => {
    if (lane === null) return
    const fromCol = row.written.includes(k) ? row.dotCol : k
    lines.push(
      <path
        key={`b${k}`}
        d={edgePath(centerX(fromCol), mid, centerX(k), rowHeight)}
        stroke={lane.color}
        fill="none"
        strokeWidth={1.5}
      />
    )
  })

  return (
    <svg
      className="shrink-0"
      width={w}
      height={rowHeight}
      viewBox={`0 0 ${w} ${rowHeight}`}
      style={{ width: w, height: rowHeight }}
      aria-hidden
    >
      {lines}
      <circle
        cx={centerX(row.dotCol)}
        cy={mid}
        r={dotRadius}
        fill={row.isMerge ? "var(--background)" : row.color}
        stroke={row.color}
        strokeWidth={row.isMerge ? 1.5 : 0}
      />
    </svg>
  )
}
