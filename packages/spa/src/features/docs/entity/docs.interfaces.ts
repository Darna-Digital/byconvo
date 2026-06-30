/**
 * `docs` feature — creating and saving markdown plans. The orchestration is
 * thin (a doc must have a non-empty title to be created), but it lives here
 * behind injected API side effects to keep the page component declarative and
 * the rules unit-testable.
 */
import type { Doc } from "@/lib/api/types"

export interface DocsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (title: string) => Promise<Doc>
    readonly save: (id: string, content: string) => Promise<Doc>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface DocsFunctions {
  /** Create a doc; returns null when the title is blank (no-op). */
  readonly create: (title: string) => Promise<Doc | null>
  readonly save: (id: string, content: string) => Promise<Doc>
  readonly remove: (id: string) => Promise<void>
}
