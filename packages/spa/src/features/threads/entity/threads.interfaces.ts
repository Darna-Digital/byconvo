/**
 * `threads` feature — creating terminal threads, running commands in
 * them, renaming and linking them to a task. The light orchestration
 * (trimming input, skipping blank commands, threading the current title through
 * a task-link edit) lives here behind injected API side effects so it stays
 * unit-testable without a server.
 */
import type { AgentKind, Thread, ThreadEntry } from "@/lib/api/types"

export interface ThreadsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly create: (input: {
      title?: string
      agent: AgentKind
      branch?: string
      taskKey?: string | null
    }) => Promise<Thread>
    readonly run: (id: string, command: string) => Promise<ThreadEntry>
    readonly rename: (
      id: string,
      input: { title: string; branch?: string; taskKey?: string | null }
    ) => Promise<Thread>
    readonly remove: (id: string) => Promise<void>
  }
}

export interface ThreadsFunctions {
  /** Create a thread bound to an agent, grouped under `branch`; an empty title
   * uses the server default. */
  readonly create: (
    agent: AgentKind,
    title: string,
    taskKey: string | null,
    branch: string
  ) => Promise<Thread>
  /** Run a command; returns null (no-op) when the command is blank. */
  readonly run: (id: string, command: string) => Promise<ThreadEntry | null>
  /** Rename a thread, leaving its task link untouched. */
  readonly rename: (id: string, title: string) => Promise<Thread>
  /** Link (or, with null, unlink) a task without changing the title. */
  readonly linkTask: (
    id: string,
    currentTitle: string,
    taskKey: string | null
  ) => Promise<Thread>
  /** Move a thread to another branch group without changing the title. */
  readonly setBranch: (
    id: string,
    currentTitle: string,
    branch: string
  ) => Promise<Thread>
  readonly remove: (id: string) => Promise<void>
}
