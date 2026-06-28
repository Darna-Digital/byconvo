import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import { ThreadsMemory } from "../layer/threads.layer.memory.ts"
import { ThreadsService } from "./threads.service.ts"

describe("ThreadsService", () => {
  it.effect("create stamps an id + default title and lists it back", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({
        title: "",
        agent: "terminal",
        taskKey: null,
      })
      expect(created.id).not.toBe("")
      expect(created.title).toBe("New thread")
      expect(created.agent).toBe("terminal")
      const all = yield* threads.list
      expect(all.map((t) => t.id)).toContain(created.id)
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("run records the command and renames the default thread", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({
        title: "",
        agent: "terminal",
        taskKey: null,
      })
      const entry = yield* threads.run(created.id, "echo hi")
      expect(entry.command).toBe("echo hi")
      expect(entry.exitCode).toBe(0)
      const full = yield* threads.get(created.id)
      expect(full.entries).toHaveLength(1)
      // Title reflects what's running once it leaves the default state.
      expect(full.title).toBe("echo")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("an agent thread wraps the input in the agent CLI invocation", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({
        title: "",
        agent: "claude",
        taskKey: null,
      })
      // Agent threads are named after the agent (Zed-style).
      expect(created.title).toBe("Claude Code")
      const entry = yield* threads.run(created.id, "explain this repo")
      // The history stores the raw prompt, not the wrapped command…
      expect(entry.command).toBe("explain this repo")
      // …but the memory TerminalExec echoes back what it was asked to run, so
      // stdout proves the prompt was wrapped in the `claude` invocation.
      expect(entry.stdout).toContain("claude -p 'explain this repo'")
      // The agent title is preserved across runs.
      const full = yield* threads.get(created.id)
      expect(full.title).toBe("Claude Code")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("opencode threads wrap the prompt in `opencode run`", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({
        title: "",
        agent: "opencode",
        taskKey: null,
      })
      const entry = yield* threads.run(created.id, "add a test")
      expect(entry.stdout).toContain("opencode run 'add a test'")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("get fails with NotFound for an unknown id", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const result = yield* Effect.flip(threads.get("nope"))
      expect(result._tag).toBe("NotFound")
    }).pipe(Effect.provide(ThreadsMemory()))
  )

  it.effect("remove deletes by id", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadsService
      const created = yield* threads.create({
        title: "work",
        agent: "terminal",
        taskKey: null,
      })
      yield* threads.remove(created.id)
      const all = yield* threads.list
      expect(all).toHaveLength(0)
    }).pipe(Effect.provide(ThreadsMemory()))
  )
})
