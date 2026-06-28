/**
 * File-backed terminal-thread store — persists threads (with their run history)
 * to `.byconvo/threads.json` inside the selected repository, and runs commands
 * through TerminalExec scoped to that repo.
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { TerminalExec } from "../../../layers/terminal/terminal-exec.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import { agentCommand, agentDefaultTitle } from "../agents.ts"
import { Thread, type ThreadEntry } from "../schema/threads.schema.model.ts"
import type {
  CreateThreadInput,
  RenameThreadInput,
  ThreadsRepo,
} from "./threads.repository.ts"

const ThreadsFile = Schema.Array(Thread)

const threadsPath = (repoPath: string) => `${repoPath}/.byconvo/threads.json`

const readThreads = (repoPath: string): ReadonlyArray<Thread> => {
  try {
    const raw = readFileSync(threadsPath(repoPath), "utf8")
    return Schema.decodeUnknownSync(ThreadsFile)(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

const writeThreads = (repoPath: string, threads: ReadonlyArray<Thread>) => {
  mkdirSync(`${repoPath}/.byconvo`, { recursive: true })
  writeFileSync(threadsPath(repoPath), `${JSON.stringify(threads, null, 2)}\n`)
}

const summarize = (thread: Thread) => ({
  id: thread.id,
  title: thread.title,
  agent: thread.agent,
  taskKey: thread.taskKey,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  entryCount: thread.entries.length,
  lastCommand:
    thread.entries.length > 0
      ? thread.entries[thread.entries.length - 1].command
      : null,
})

/** A short title from a command — the first token, like Zed's thread labels. */
const titleFromCommand = (command: string) => {
  const trimmed = command.trim()
  const first = trimmed.split(/\s+/)[0] ?? ""
  return first.length > 0 ? first.slice(0, 60) : "terminal"
}

const DEFAULT_TITLE = "New thread"

// Module-scoped so ids stay unique across per-request repository instances.
let counter = 0
const nextId = (prefix: string) => {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export const makeFileThreadsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext
  const terminal = yield* TerminalExec

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        // A thrown NotFound is a real 404, not a storage failure — preserve it.
        catch: (error) =>
          error instanceof NotFound
            ? error
            : new StorageError({
                reason: error instanceof Error ? error.message : String(error),
              }),
      })
    )

  const requireThread = (repoPath: string, id: string) => {
    const thread = readThreads(repoPath).find((t) => t.id === id)
    if (thread === undefined) {
      throw new NotFound({ reason: `thread ${id} not found` })
    }
    return thread
  }

  const list: ThreadsRepo["list"] = withFile((repoPath) =>
    [...readThreads(repoPath)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarize)
  )

  const get: ThreadsRepo["get"] = (id) =>
    withFile((repoPath) => requireThread(repoPath, id))

  const create: ThreadsRepo["create"] = (input: CreateThreadInput) =>
    withFile((repoPath) => {
      const now = new Date().toISOString()
      const created: Thread = {
        id: nextId("t"),
        title:
          input.title.trim().length > 0
            ? input.title.trim()
            : agentDefaultTitle(input.agent),
        agent: input.agent,
        taskKey: input.taskKey,
        createdAt: now,
        updatedAt: now,
        entries: [],
      }
      writeThreads(repoPath, [created, ...readThreads(repoPath)])
      return created
    })

  const rename: ThreadsRepo["rename"] = (id, input: RenameThreadInput) =>
    withFile((repoPath) => {
      const existing = requireThread(repoPath, id)
      const updated: Thread = {
        ...existing,
        title:
          input.title.trim().length > 0 ? input.title.trim() : existing.title,
        taskKey: input.taskKey === undefined ? existing.taskKey : input.taskKey,
        updatedAt: new Date().toISOString(),
      }
      writeThreads(
        repoPath,
        readThreads(repoPath).map((t) => (t.id === id ? updated : t))
      )
      return updated
    })

  const remove: ThreadsRepo["remove"] = (id) =>
    withFile((repoPath) => {
      writeThreads(
        repoPath,
        readThreads(repoPath).filter((t) => t.id !== id)
      )
    })

  const run: ThreadsRepo["run"] = (id, input) =>
    Effect.gen(function* () {
      // Fetch first (fails NotFound before spawning) and to read the agent.
      const thread = yield* withFile((repoPath) => requireThread(repoPath, id))
      const result = yield* terminal.run(agentCommand(thread.agent, input))
      return yield* withFile((repoPath) => {
        const existing = requireThread(repoPath, id)
        const entry: ThreadEntry = {
          id: nextId("e"),
          // Store what the user typed (the prompt / command), not the wrapped
          // agent invocation, so the history reads back naturally.
          command: input,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          createdAt: new Date().toISOString(),
        }
        const updated: Thread = {
          ...existing,
          // Reflect what's running in the title, like Zed terminal threads.
          title:
            existing.title === DEFAULT_TITLE
              ? titleFromCommand(input)
              : existing.title,
          updatedAt: entry.createdAt,
          entries: [...existing.entries, entry],
        }
        writeThreads(
          repoPath,
          readThreads(repoPath).map((t) => (t.id === id ? updated : t))
        )
        return entry
      })
    })

  return { list, get, create, rename, remove, run } satisfies ThreadsRepo
})
