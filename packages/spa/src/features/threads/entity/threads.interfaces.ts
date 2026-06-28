/**
 * `threads` feature — creating Zed-style terminal threads, running commands in
 * them, renaming and linking them to a Kanban task. The light orchestration
 * (trimming input, skipping blank commands, threading the current title through
 * a task-link edit) lives here behind injected API side effects so it stays
 * unit-testable without a server.
 */
import type { Thread, ThreadEntry } from "@/lib/api/types"

export interface ThreadsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (input: {
      title?: string
      taskKey?: string | null
    }) => Promise<Thread>
    readonly run: (id: string, command: string) => Promise<ThreadEntry>
    readonly rename: (
      id: string,
      input: { title: string; taskKey?: string | null }
    ) => Promise<Thread>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface ThreadsFunctions {
  /** Create a thread; an empty title lets the server fall back to its default. */
  readonly create: (title: string, taskKey: string | null) => Promise<Thread>
  /** Run a command; returns null (no-op) when the command is blank. */
  readonly run: (id: string, command: string) => Promise<ThreadEntry | null>
  /** Rename a thread, leaving its task link untouched. */
  readonly rename: (id: string, title: string) => Promise<Thread>
  /** Link (or, with null, unlink) a Kanban task without changing the title. */
  readonly linkTask: (
    id: string,
    currentTitle: string,
    taskKey: string | null
  ) => Promise<Thread>
  readonly remove: (id: string) => Promise<void>
}
