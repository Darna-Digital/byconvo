import { vi } from "vitest"
import type { FileDiffMetadata } from "@pierre/diffs"
import type { DiffDependencies } from "../entity/diff.interfaces"

/** A tiny parsePatch stub: one file per `+++ b/<name>` header line. */
const fakeParse = (diffText: string): ReadonlyArray<FileDiffMetadata> =>
  diffText
    .split("\n")
    .filter((line) => line.startsWith("+++ b/"))
    .map(
      (line) =>
        ({ name: line.slice("+++ b/".length), type: "modified" }) as unknown as FileDiffMetadata,
    )

export const createDiffDependenciesMock = (
  overrides?: Partial<DiffDependencies["data"]>,
): DiffDependencies => ({
  data: { internalDir: ".reviewer", ...overrides },
  sideEffects: { parsePatch: vi.fn(fakeParse) },
})
