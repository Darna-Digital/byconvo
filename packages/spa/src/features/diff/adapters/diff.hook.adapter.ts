import { parsePatchFiles } from "@pierre/diffs"
import { useMemo } from "react"
import { createDiffFunctions } from "../functions/diff.functions"

/** Wires the real @pierre/diffs parser into the pure diff functions. */
export function useDiffFunctions() {
  return useMemo(
    () =>
      createDiffFunctions({
        data: { internalDir: ".byconvo" },
        sideEffects: {
          parsePatch: (text) =>
            parsePatchFiles(text).flatMap((patch) => patch.files),
        },
      }),
    []
  )
}
