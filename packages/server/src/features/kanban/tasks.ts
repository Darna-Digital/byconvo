/**
 * Task resolution — turn a free-form reference an agent (or person) gives, like
 * "DAR-123", "implement task DAR-123", or a title, into the matching card.
 * Pure and dependency-free so it's unit-tested directly.
 */
import type { Card } from "./schema/kanban.schema.model.ts"

/** A task key embedded in a phrase, e.g. the "DAR-123" in "do task DAR-123". */
const KEY_IN_TEXT = /[a-z][a-z0-9]*-\d+/i

export const resolveTask = (
  cards: ReadonlyArray<Card>,
  query: string
): Card | null => {
  const q = query.trim()
  if (q.length === 0) return null
  const lower = q.toLowerCase()

  // 1. Exact key match (case-insensitive), e.g. "DAR-123".
  const exactKey = cards.find((c) => c.key.toLowerCase() === lower)
  if (exactKey !== undefined) return exactKey

  // 2. A key embedded in a phrase, e.g. "implement task DAR-123".
  const embedded = q.match(KEY_IN_TEXT)?.[0]
  if (embedded !== undefined) {
    const byEmbedded = cards.find(
      (c) => c.key.toLowerCase() === embedded.toLowerCase()
    )
    if (byEmbedded !== undefined) return byEmbedded
  }

  // 3. Exact title match (case-insensitive).
  const exactTitle = cards.find((c) => c.title.trim().toLowerCase() === lower)
  if (exactTitle !== undefined) return exactTitle

  // 4. A task title contained in the phrase ("implement the rate limiter now").
  //    Prefer the longest matching title (most specific).
  const titleInPhrase = cards
    .filter(
      (c) =>
        c.title.trim().length > 0 &&
        lower.includes(c.title.trim().toLowerCase())
    )
    .sort((a, b) => b.title.length - a.title.length)
  if (titleInPhrase.length > 0) return titleInPhrase[0]

  // 5. The query is a substring of a title (partial title search). Prefer the
  //    shortest title (most specific match).
  const queryInTitle = cards
    .filter((c) => c.title.toLowerCase().includes(lower))
    .sort((a, b) => a.title.length - b.title.length)
  if (queryInTitle.length > 0) return queryInTitle[0]

  return null
}

/** Normalize a user-supplied key prefix: letters/digits, upper-cased. */
export const normalizePrefix = (prefix: string): string => {
  const cleaned = prefix.replace(/[^a-z0-9]/gi, "").toUpperCase()
  return cleaned.length > 0 ? cleaned : "T"
}
