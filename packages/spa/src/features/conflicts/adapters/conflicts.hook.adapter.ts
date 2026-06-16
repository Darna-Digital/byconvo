import { useMemo } from "react"
import { createConflictsFunctions } from "../functions/conflicts.functions"

/** The pure conflict parser/resolver, memoised for component use. */
export function useConflictsFunctions() {
  return useMemo(
    () => createConflictsFunctions({ data: {}, sideEffects: {} }),
    []
  )
}
