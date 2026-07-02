/**
 * The provider-agnostic turn parser contract: each provider reduces its CLI's
 * stdout to the same canonical events (t3code's vocabulary, sized down) —
 * text deltas, generic activities, a native session id, one terminal result.
 * The chat runtime is provider-blind past this seam.
 */
import type { ChatProviderKind } from "../schema/chats.schema.model.ts"
import { createClaudeTurnParser } from "./claude-stream.ts"
import { createCodexTurnParser } from "./codex-stream.ts"
import { createOpencodeTurnParser } from "./opencode-stream.ts"

export type TurnEvent =
  | { readonly type: "session"; readonly sessionId: string }
  | { readonly type: "delta"; readonly text: string }
  | {
      readonly type: "activity"
      readonly kind: string
      readonly tone: "info" | "tool" | "error"
      readonly summary: string
      readonly detail: string | null
    }
  | {
      readonly type: "result"
      readonly state: "completed" | "error"
      readonly errorMessage: string | null
      readonly totalCostUsd: number | null
    }

export interface TurnParser {
  /** Feed one stdout line; returns the canonical events it produced. */
  readonly push: (line: string) => ReadonlyArray<TurnEvent>
  /** The assistant text assembled so far (all deltas concatenated). */
  readonly text: () => string
  /** Whether a terminal `result` line has been seen. */
  readonly settled: () => boolean
}

export const createTurnParser = (provider: ChatProviderKind): TurnParser => {
  switch (provider) {
    case "claude":
      return createClaudeTurnParser()
    case "codex":
      return createCodexTurnParser()
    case "opencode":
      return createOpencodeTurnParser()
  }
}
