import type { ConflictsDependencies } from "../entity/conflicts.interfaces"

export const createConflictsDependenciesMock = (): ConflictsDependencies => ({
  data: {},
  sideEffects: {},
})

/** A small two-way conflict with surrounding context, for tests/stories. */
export const sampleConflict = [
  "import { a } from './a'",
  "<<<<<<< HEAD",
  "const value = 1",
  "=======",
  "const value = 2",
  ">>>>>>> feature",
  "export default value",
].join("\n")

/** A diff3 conflict carrying the merge base. */
export const sampleDiff3Conflict = [
  "<<<<<<< HEAD",
  "ours",
  "||||||| base",
  "original",
  "=======",
  "theirs",
  ">>>>>>> feature",
].join("\n")
