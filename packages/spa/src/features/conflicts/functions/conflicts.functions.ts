import type {
  ConflictRegion,
  ConflictsDependencies,
  ConflictsFunctions,
  Region,
} from "../entity/conflicts.interfaces"

const OURS = "<<<<<<<"
const BASE = "|||||||"
const SEP = "======="
const THEIRS = ">>>>>>>"

const isMarker = (line: string, marker: string): boolean =>
  line === marker || line.startsWith(`${marker} `)

const label = (line: string, marker: string): string =>
  line.slice(marker.length).trim()

export function createConflictsFunctions(
  _d: ConflictsDependencies
): ConflictsFunctions {
  const parse: ConflictsFunctions["parse"] = (content) => {
    const lines = content.split("\n")
    const regions: Array<Region> = []
    let context: Array<string> = []
    let conflictId = 0

    const flushContext = () => {
      if (context.length > 0) {
        regions.push({ kind: "context", lines: context })
        context = []
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!isMarker(line, OURS)) {
        context.push(line)
        continue
      }
      // Enter a conflict block. Collect ours → (optional base) → theirs.
      flushContext()
      const oursLabel = label(line, OURS)
      const ours: Array<string> = []
      const base: Array<string> = []
      const theirs: Array<string> = []
      let theirsLabel = ""
      let hasBase = false
      let section: "ours" | "base" | "theirs" = "ours"
      i++
      for (; i < lines.length; i++) {
        const inner = lines[i]
        if (isMarker(inner, BASE)) {
          hasBase = true
          section = "base"
          continue
        }
        if (isMarker(inner, SEP)) {
          section = "theirs"
          continue
        }
        if (isMarker(inner, THEIRS)) {
          theirsLabel = label(inner, THEIRS)
          break
        }
        if (section === "ours") ours.push(inner)
        else if (section === "base") base.push(inner)
        else theirs.push(inner)
      }
      regions.push({
        kind: "conflict",
        id: conflictId++,
        ours,
        theirs,
        base: hasBase ? base : null,
        oursLabel,
        theirsLabel,
      })
    }

    flushContext()
    return regions
  }

  const conflicts: ConflictsFunctions["conflicts"] = (regions) =>
    regions.filter((r): r is ConflictRegion => r.kind === "conflict")

  const reconstruct: ConflictsFunctions["reconstruct"] = (regions, side) => {
    const out: Array<string> = []
    for (const region of regions) {
      if (region.kind === "context") out.push(...region.lines)
      else out.push(...(side === "ours" ? region.ours : region.theirs))
    }
    return out.join("\n")
  }

  const applyResolutions: ConflictsFunctions["applyResolutions"] = (
    regions,
    choices
  ) => {
    const out: Array<string> = []
    for (const region of regions) {
      if (region.kind === "context") {
        out.push(...region.lines)
        continue
      }
      const choice = choices[region.id]
      switch (choice) {
        case "ours":
          out.push(...region.ours)
          break
        case "theirs":
          out.push(...region.theirs)
          break
        case "both-ours-first":
          out.push(...region.ours, ...region.theirs)
          break
        case "both-theirs-first":
          out.push(...region.theirs, ...region.ours)
          break
        default:
          // Unresolved — keep the markers so nothing is silently dropped.
          out.push(
            `${OURS} ${region.oursLabel}`.trimEnd(),
            ...region.ours,
            SEP,
            ...region.theirs,
            `${THEIRS} ${region.theirsLabel}`.trimEnd()
          )
      }
    }
    return out.join("\n")
  }

  const isFullyResolved: ConflictsFunctions["isFullyResolved"] = (
    regions,
    choices
  ) =>
    conflicts(regions).every(
      (region) => choices[region.id] !== undefined
    )

  return { parse, conflicts, reconstruct, applyResolutions, isFullyResolved }
}
