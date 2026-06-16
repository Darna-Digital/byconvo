/**
 * `conflicts` feature — the pure logic behind the JetBrains-style merge
 * resolver. Git leaves a conflicted file on disk with `<<<<<<< / ======= /
 * >>>>>>>` markers (plus an optional `|||||||` base for diff3); this layer
 * parses those into ordered regions, reconstructs each side for the two Pierre
 * panes, and applies the user's per-region choices into a merged file. No IO —
 * the file content is fetched by the view and the resolution is written back
 * through the git-actions adapter.
 */

/** A run of unconflicted lines shared by both sides. */
export interface ContextRegion {
  readonly kind: "context"
  readonly lines: ReadonlyArray<string>
}

/** A `<<<<<<< … >>>>>>>` block: the two (or three) competing versions. */
export interface ConflictRegion {
  readonly kind: "conflict"
  /** Stable index among conflict regions (0-based), used to key choices. */
  readonly id: number
  readonly ours: ReadonlyArray<string>
  readonly theirs: ReadonlyArray<string>
  /** The merge base, when the file was produced with diff3-style markers. */
  readonly base: ReadonlyArray<string> | null
  readonly oursLabel: string
  readonly theirsLabel: string
}

export type Region = ContextRegion | ConflictRegion

/** How the user chose to resolve a single conflict region. */
export type ConflictChoice =
  | "ours"
  | "theirs"
  | "both-ours-first"
  | "both-theirs-first"

/** Per-region choices, keyed by `ConflictRegion.id`. */
export type ConflictChoices = Readonly<Record<number, ConflictChoice>>

export interface ConflictsDependencies {
  readonly data: Record<string, never>
  readonly sideEffects: Record<string, never>
}

export interface ConflictsFunctions {
  /** Parse a conflicted file's content into ordered context/conflict regions. */
  readonly parse: (content: string) => ReadonlyArray<Region>
  /** Just the conflict regions (for counting / iterating choices). */
  readonly conflicts: (
    regions: ReadonlyArray<Region>
  ) => ReadonlyArray<ConflictRegion>
  /** Rebuild one whole side of the file (for a Pierre pane). */
  readonly reconstruct: (
    regions: ReadonlyArray<Region>,
    side: "ours" | "theirs"
  ) => string
  /** Apply the per-region choices, producing the merged file content. */
  readonly applyResolutions: (
    regions: ReadonlyArray<Region>,
    choices: ConflictChoices
  ) => string
  /** Has every conflict region been given a choice? */
  readonly isFullyResolved: (
    regions: ReadonlyArray<Region>,
    choices: ConflictChoices
  ) => boolean
}
