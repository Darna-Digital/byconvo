/** In-memory terminal-thread store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import { TerminalExec } from "../../../layers/terminal/terminal-exec.ts"
import type { Thread, ThreadEntry } from "../schema/threads.schema.model.ts"
import type {
  CreateThreadInput,
  RenameThreadInput,
  ThreadsRepo,
} from "./threads.repository.ts"

const summarize = (thread: Thread) => ({
  id: thread.id,
  title: thread.title,
  taskKey: thread.taskKey,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  entryCount: thread.entries.length,
  lastCommand:
    thread.entries.length > 0
      ? thread.entries[thread.entries.length - 1].command
      : null,
})

const DEFAULT_TITLE = "New thread"

const titleFromCommand = (command: string) => {
  const first = command.trim().split(/\s+/)[0] ?? ""
  return first.length > 0 ? first.slice(0, 60) : "terminal"
}

export const makeMemoryThreadsRepository = (seed: ReadonlyArray<Thread> = []) =>
  Effect.gen(function* () {
    const terminal = yield* TerminalExec
    const store = yield* Ref.make<ReadonlyArray<Thread>>([...seed])
    let counter = 0
    const nextId = (prefix: string) => {
      counter += 1
      return `${prefix}-mem-${counter}`
    }
    const now = () => "2026-01-01T00:00:00.000Z"

    const find = (threads: ReadonlyArray<Thread>, id: string) => {
      const thread = threads.find((t) => t.id === id)
      if (thread === undefined) {
        return Effect.fail(new NotFound({ reason: `thread ${id} not found` }))
      }
      return Effect.succeed(thread)
    }

    const repo: ThreadsRepo = {
      list: Ref.get(store).pipe(
        Effect.map((threads) => threads.map(summarize))
      ),
      get: (id) =>
        Effect.flatMap(Ref.get(store), (threads) => find(threads, id)),
      create: (input: CreateThreadInput) =>
        Effect.gen(function* () {
          const created: Thread = {
            id: nextId("t"),
            title:
              input.title.trim().length > 0
                ? input.title.trim()
                : DEFAULT_TITLE,
            taskKey: input.taskKey,
            createdAt: now(),
            updatedAt: now(),
            entries: [],
          }
          yield* Ref.update(store, (all) => [created, ...all])
          return created
        }),
      rename: (id, input: RenameThreadInput) =>
        Effect.gen(function* () {
          const existing = yield* find(yield* Ref.get(store), id)
          const updated: Thread = {
            ...existing,
            title:
              input.title.trim().length > 0
                ? input.title.trim()
                : existing.title,
            taskKey:
              input.taskKey === undefined ? existing.taskKey : input.taskKey,
            updatedAt: now(),
          }
          yield* Ref.update(store, (all) =>
            all.map((t) => (t.id === id ? updated : t))
          )
          return updated
        }),
      remove: (id) =>
        Ref.update(store, (all) => all.filter((t) => t.id !== id)),
      run: (id, command) =>
        Effect.gen(function* () {
          const existing = yield* find(yield* Ref.get(store), id)
          const result = yield* terminal.run(command)
          const entry: ThreadEntry = {
            id: nextId("e"),
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            createdAt: now(),
          }
          yield* Ref.update(store, (all) =>
            all.map((t) =>
              t.id === id
                ? {
                    ...existing,
                    title:
                      existing.title === DEFAULT_TITLE
                        ? titleFromCommand(command)
                        : existing.title,
                    updatedAt: now(),
                    entries: [...existing.entries, entry],
                  }
                : t
            )
          )
          return entry
        }),
    }
    return repo
  })
