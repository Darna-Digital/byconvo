/**
 * CodeMirror extension that turns a buffer containing git conflict markers into
 * a JetBrains-style inline merge surface: each `<<<<<<< … >>>>>>>` block gets a
 * coloured background (ours / base / theirs / markers) and an accept toolbar
 * (ours / both / theirs) rendered above it. Accepting replaces the whole block
 * with the chosen side, so the editor's text is always the authoritative merge
 * result — the user can also edit freely between or instead of accepting.
 */
import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view"

const START = /^<<<<<<</
const BASE = /^\|\|\|\|\|\|\|/
const SEP = /^=======/
const END = /^>>>>>>>/

export interface ConflictBlock {
  /** Document offset of the start of the `<<<<<<<` line. */
  from: number
  /** Document offset of the end of the `>>>>>>>` line (excluding the break). */
  to: number
  oursText: string
  theirsText: string
}

/** Find every conflict block in the document, in order. */
export function findConflictBlocks(state: EditorState): Array<ConflictBlock> {
  const { doc } = state
  const blocks: Array<ConflictBlock> = []
  const total = doc.lines
  let n = 1
  while (n <= total) {
    const line = doc.line(n)
    if (!START.test(line.text)) {
      n++
      continue
    }
    const ours: Array<string> = []
    const theirs: Array<string> = []
    let section: "ours" | "base" | "theirs" = "ours"
    let endTo = line.to
    let m = n + 1
    for (; m <= total; m++) {
      const l = doc.line(m)
      if (BASE.test(l.text)) {
        section = "base"
        continue
      }
      if (SEP.test(l.text)) {
        section = "theirs"
        continue
      }
      if (END.test(l.text)) {
        endTo = l.to
        break
      }
      if (section === "ours") ours.push(l.text)
      else if (section === "theirs") theirs.push(l.text)
    }
    blocks.push({
      from: line.from,
      to: endTo,
      oursText: ours.join("\n"),
      theirsText: theirs.join("\n"),
    })
    n = m + 1
  }
  return blocks
}

class AcceptWidget extends WidgetType {
  constructor(readonly block: ConflictBlock) {
    super()
  }

  override eq(other: AcceptWidget): boolean {
    return (
      other.block.from === this.block.from &&
      other.block.to === this.block.to &&
      other.block.oursText === this.block.oursText &&
      other.block.theirsText === this.block.theirsText
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div")
    wrap.className = "cm-conflict-actions"
    const replace = (text: string) =>
      view.dispatch({
        changes: { from: this.block.from, to: this.block.to, insert: text },
      })
    const { oursText, theirsText } = this.block
    const both =
      oursText.length > 0 && theirsText.length > 0
        ? `${oursText}\n${theirsText}`
        : oursText + theirsText
    const mk = (label: string, run: () => void) => {
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = label
      button.className = "cm-conflict-btn"
      // mousedown (not click) so the editor selection/focus isn't stolen first.
      button.addEventListener("mousedown", (event) => {
        event.preventDefault()
        run()
      })
      wrap.append(button)
    }
    mk("◀ Accept ours", () => replace(oursText))
    mk("Accept both", () => replace(both))
    mk("Accept theirs ▶", () => replace(theirsText))
    return wrap
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const { doc } = state
  const ranges: Array<Range<Decoration>> = []
  for (const block of findConflictBlocks(state)) {
    ranges.push(
      Decoration.widget({
        widget: new AcceptWidget(block),
        block: true,
        side: -1,
      }).range(block.from)
    )
    let line = doc.lineAt(block.from)
    let section: "ours" | "base" | "theirs" = "ours"
    while (line.from <= block.to) {
      const isMarker =
        START.test(line.text) ||
        BASE.test(line.text) ||
        SEP.test(line.text) ||
        END.test(line.text)
      const cls = isMarker
        ? "cm-conflict-marker"
        : section === "theirs"
          ? "cm-conflict-theirs"
          : section === "base"
            ? "cm-conflict-base"
            : "cm-conflict-ours"
      ranges.push(Decoration.line({ attributes: { class: cls } }).range(line.from))
      if (BASE.test(line.text)) section = "base"
      else if (SEP.test(line.text)) section = "theirs"
      if (line.to + 1 > doc.length) break
      line = doc.lineAt(line.to + 1)
    }
  }
  return Decoration.set(ranges, true)
}

const conflictField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update: (deco, tr) =>
    tr.docChanged ? buildDecorations(tr.state) : deco.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field),
})

const conflictTheme = EditorView.baseTheme({
  ".cm-conflict-marker": {
    backgroundColor: "rgba(120,120,120,0.14)",
    color: "rgba(120,120,120,0.9)",
  },
  ".cm-conflict-ours": { backgroundColor: "rgba(56,139,253,0.13)" },
  ".cm-conflict-theirs": { backgroundColor: "rgba(163,113,247,0.15)" },
  ".cm-conflict-base": { backgroundColor: "rgba(120,120,120,0.07)" },
  ".cm-conflict-actions": {
    display: "flex",
    gap: "6px",
    padding: "3px 8px",
    backgroundColor: "rgba(245,158,11,0.10)",
  },
  ".cm-conflict-btn": {
    font: "inherit",
    fontSize: "11px",
    lineHeight: "1.4",
    padding: "1px 7px",
    border: "1px solid var(--border)",
    borderRadius: "5px",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    cursor: "pointer",
  },
  ".cm-conflict-btn:hover": { backgroundColor: "var(--muted)" },
})

export const mergeConflictExtension: Extension = [conflictField, conflictTheme]
