/**
 * `commit-graph` feature — lays a newest-first commit list into swim-lanes for
 * the history graph, mirroring how a desktop git GUI draws branch/merge edges.
 * The algorithm is pure: lane colours and cell geometry are injected as `data`
 * so the same logic drives rendering and tests without touching the DOM.
 */
import type { CommitInfo } from "@/lib/api/types"

/** A lane that is "reserved" for the next commit it expects to reach. */
export interface Lane {
  readonly target: string
  readonly color: string
}

/** Per-commit graph geometry: which column holds the dot, and the lanes that
 * pass through above (`before`) and below (`after`) it. */
export interface GraphRow {
  readonly sha: string
  readonly dotCol: number
  readonly color: string
  readonly isMerge: boolean
  readonly before: ReadonlyArray<Lane | null>
  readonly after: ReadonlyArray<Lane | null>
  /** Columns this row wrote into (its dot column plus any opened merge lanes). */
  readonly written: ReadonlyArray<number>
}

export interface CommitGraphLayout {
  readonly rows: ReadonlyArray<GraphRow>
  /** Widest lane count across all rows — drives the SVG cell width. */
  readonly width: number
}

/** Lane colours and cell geometry — injected so layout stays presentation-free. */
export interface CommitGraphConfig {
  readonly colors: ReadonlyArray<string>
  readonly colWidth: number
  readonly dotRadius: number
  readonly rowHeight: number
}

export interface CommitGraphDependencies {
  readonly data: CommitGraphConfig
  readonly sideEffects: Record<string, never>
}

export interface CommitGraphFunctions {
  readonly buildLayout: (commits: ReadonlyArray<CommitInfo>) => CommitGraphLayout
  /** Horizontal centre of a lane column, in SVG units. */
  readonly centerX: (col: number) => number
  /** A lane edge: straight when the column is unchanged, a soft S-curve when it shifts. */
  readonly edgePath: (x1: number, y1: number, x2: number, y2: number) => string
}

/** Distinct lane colours that read well on both light and dark surfaces. */
export const GRAPH_COLORS: ReadonlyArray<string> = [
  "#5b9bf8",
  "#48b884",
  "#e0533d",
  "#d8a13a",
  "#a86fd4",
  "#3bb0c9",
  "#e06fa8",
  "#8c9440",
]

export const DEFAULT_GRAPH_CONFIG: CommitGraphConfig = {
  colors: GRAPH_COLORS,
  colWidth: 14,
  dotRadius: 3.5,
  rowHeight: 26,
}
