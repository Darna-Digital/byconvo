import { describe, expect, it } from "vitest"
import type { Card } from "./schema/kanban.schema.model.ts"
import { normalizePrefix, resolveTask } from "./tasks.ts"

const card = (over: Partial<Card>): Card => ({
  id: "id",
  key: "DAR-1",
  title: "Task",
  description: "",
  column: "todo",
  order: 1,
  createdAt: "",
  updatedAt: "",
  ...over,
})

const cards: ReadonlyArray<Card> = [
  card({ id: "a", key: "DAR-1", title: "Add rate limiting" }),
  card({ id: "b", key: "DAR-23", title: "Fix login" }),
  card({ id: "c", key: "DAR-123", title: "Document the API" }),
]

describe("resolveTask", () => {
  it("matches an exact key, case-insensitively", () => {
    expect(resolveTask(cards, "DAR-23")?.id).toBe("b")
    expect(resolveTask(cards, "dar-123")?.id).toBe("c")
  })

  it("extracts a key embedded in a phrase", () => {
    expect(resolveTask(cards, "implement task DAR-123")?.id).toBe("c")
    expect(resolveTask(cards, "please finish DAR-1 today")?.id).toBe("a")
  })

  it("matches an exact title", () => {
    expect(resolveTask(cards, "Fix login")?.id).toBe("b")
  })

  it("matches a title contained in a phrase", () => {
    expect(resolveTask(cards, "go implement Add rate limiting now")?.id).toBe(
      "a"
    )
  })

  it("matches a partial title (query is a substring)", () => {
    expect(resolveTask(cards, "rate limit")?.id).toBe("a")
  })

  it("returns null when nothing matches", () => {
    expect(resolveTask(cards, "DAR-999")).toBeNull()
    expect(resolveTask(cards, "")).toBeNull()
  })

  it("does not confuse a key prefix substring across keys", () => {
    // "DAR-1" must not match "DAR-123" by accident.
    expect(resolveTask(cards, "DAR-1")?.id).toBe("a")
  })
})

describe("normalizePrefix", () => {
  it("upper-cases and strips punctuation, falling back to T", () => {
    expect(normalizePrefix("dar")).toBe("DAR")
    expect(normalizePrefix("d.a-r ")).toBe("DAR")
    expect(normalizePrefix("  ")).toBe("T")
  })
})
