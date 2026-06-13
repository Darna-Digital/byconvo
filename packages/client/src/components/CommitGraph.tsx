import type { ReactElement } from "react";
import type { CommitInfo } from "../types";

// Distinct lane colours that read well on both light and dark surfaces.
const COLORS = [
  "#5b9bf8",
  "#48b884",
  "#e0533d",
  "#d8a13a",
  "#a86fd4",
  "#3bb0c9",
  "#e06fa8",
  "#8c9440",
];

/** Commit rows are a fixed height so the SVG graph aligns with the text rows. */
export const GRAPH_ROW_H = 24;
const COL_W = 14;
const DOT_R = 3.5;

interface Lane {
  target: string;
  color: string;
}

interface GraphRow {
  sha: string;
  dotCol: number;
  color: string;
  isMerge: boolean;
  before: ReadonlyArray<Lane | null>;
  after: ReadonlyArray<Lane | null>;
  written: ReadonlyArray<number>;
}

export interface CommitGraphLayout {
  rows: ReadonlyArray<GraphRow>;
  width: number;
}

/**
 * Lay the commits out into swim-lanes. Commits arrive newest-first; each lane
 * tracks the next commit it expects (a child placed it there). A commit takes
 * the leftmost lane pointing at it, its first parent continues that lane, and
 * extra parents (merges) open new lanes. Lanes whose parent never arrives in
 * the fetched window simply run off the bottom — exactly like a real GUI.
 */
export function buildCommitGraph(
  commits: ReadonlyArray<CommitInfo>,
): CommitGraphLayout {
  const lanes: Array<Lane | null> = [];
  let colorCounter = 0;
  const nextColor = () => COLORS[colorCounter++ % COLORS.length] as string;
  const firstFree = () => {
    const i = lanes.indexOf(null);
    return i === -1 ? lanes.length : i;
  };

  const rows: Array<GraphRow> = [];
  let width = 1;

  for (const commit of commits) {
    const before = lanes.map((lane) => (lane ? { ...lane } : null));

    let dotCol = lanes.findIndex((lane) => lane !== null && lane.target === commit.sha);
    let color: string;
    if (dotCol === -1) {
      dotCol = firstFree();
      color = nextColor();
      lanes[dotCol] = { target: commit.sha, color };
    } else {
      color = lanes[dotCol]!.color;
    }

    // Other lanes pointing at this same commit converge into it and end here.
    for (let k = 0; k < lanes.length; k++) {
      if (k !== dotCol && lanes[k]?.target === commit.sha) lanes[k] = null;
    }

    const written: Array<number> = [dotCol];
    const [first, ...extra] = commit.parents;
    if (first === undefined) {
      lanes[dotCol] = null;
    } else {
      lanes[dotCol] = { target: first, color };
      for (const parent of extra) {
        const col = firstFree();
        lanes[col] = { target: parent, color: nextColor() };
        written.push(col);
      }
    }

    const after = lanes.map((lane) => (lane ? { ...lane } : null));
    width = Math.max(width, before.length, after.length);
    rows.push({
      sha: commit.sha,
      dotCol,
      color,
      isMerge: commit.parents.length > 1,
      before,
      after,
      written,
    });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
  }

  return { rows, width };
}

const centerX = (col: number) => col * COL_W + COL_W / 2;

// Straight when the lane keeps its column, a soft S-curve when it shifts.
const edge = (x1: number, y1: number, x2: number, y2: number): string =>
  x1 === x2
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;

/** Render one commit's graph cell: passing lanes, converging/branching edges, dot. */
export function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const w = Math.max(width, 1) * COL_W;
  const h = GRAPH_ROW_H;
  const mid = h / 2;
  const lines: Array<ReactElement> = [];

  row.before.forEach((lane, k) => {
    if (lane === null) return;
    const toCol = lane.target === row.sha ? row.dotCol : k;
    lines.push(
      <path
        key={`t${k}`}
        d={edge(centerX(k), 0, centerX(toCol), mid)}
        stroke={lane.color}
        fill="none"
        strokeWidth={1.5}
      />,
    );
  });

  row.after.forEach((lane, k) => {
    if (lane === null) return;
    const fromCol = row.written.includes(k) ? row.dotCol : k;
    lines.push(
      <path
        key={`b${k}`}
        d={edge(centerX(fromCol), mid, centerX(k), h)}
        stroke={lane.color}
        fill="none"
        strokeWidth={1.5}
      />,
    );
  });

  return (
    <svg
      className="commit-graph-cell"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: w, height: h, flexShrink: 0 }}
      aria-hidden
    >
      {lines}
      <circle
        cx={centerX(row.dotCol)}
        cy={mid}
        r={DOT_R}
        fill={row.isMerge ? "var(--bg-panel)" : row.color}
        stroke={row.color}
        strokeWidth={row.isMerge ? 1.5 : 0}
      />
    </svg>
  );
}
