/**
 * opencode `run` → canonical chat events.
 *
 * `opencode run` prints the reply as plain text while it works — there is no
 * stable machine stream to parse in one-shot mode — so every stdout line is
 * forwarded as a text delta. No tool activities, no in-stream session id
 * (the runtime captures that from opencode's session files afterwards, the
 * same way the PTY threads do); the exit code settles the turn.
 */
import type { TurnEvent, TurnParser } from "./turn-parser.ts"

export const createOpencodeTurnParser = (): TurnParser => {
  let buffer = ""

  const push = (line: string): ReadonlyArray<TurnEvent> => {
    // Preserve blank lines between paragraphs, but not before any text.
    if (buffer.length === 0 && line.trim().length === 0) return []
    const text = buffer.length === 0 ? line : `\n${line}`
    buffer += text
    return [{ type: "delta", text }]
  }

  return { push, text: () => buffer, settled: () => false }
}
