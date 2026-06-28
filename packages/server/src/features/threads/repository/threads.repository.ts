/** Local terminal-thread store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
  TerminalError,
} from "../../../layers/errors.ts"
import type {
  AgentKind,
  Thread,
  ThreadEntry,
  ThreadSummary,
} from "../schema/threads.schema.model.ts"

export interface CreateThreadInput {
  readonly title: string
  readonly agent: AgentKind
  readonly taskKey: string | null
}

export interface RenameThreadInput {
  readonly title: string
  /** `undefined` leaves the link untouched; `null` clears it. */
  readonly taskKey?: string | null
}

export type ThreadsFailure =
  | NoRepoSelected
  | NotFound
  | StorageError
  | TerminalError

export interface ThreadsRepo {
  readonly list: Effect.Effect<ReadonlyArray<ThreadSummary>, ThreadsFailure>
  readonly get: (id: string) => Effect.Effect<Thread, ThreadsFailure>
  readonly create: (
    input: CreateThreadInput
  ) => Effect.Effect<Thread, ThreadsFailure>
  readonly rename: (
    id: string,
    input: RenameThreadInput
  ) => Effect.Effect<Thread, ThreadsFailure>
  readonly remove: (id: string) => Effect.Effect<void, ThreadsFailure>
  /** Run a command in the repo, append it as an entry, return that entry. */
  readonly run: (
    id: string,
    command: string
  ) => Effect.Effect<ThreadEntry, ThreadsFailure>
}

export class ThreadsRepository extends Context.Service<
  ThreadsRepository,
  ThreadsRepo
>()("ThreadsRepository") {}
