/**
 * Commit-prefix store contract — persistence for the user's saved prefixes.
 * Pure data access (no business logic): the service layer composes these with
 * git + Claude to draft messages.
 */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { NotFound, StorageError } from "../../../layers/errors.ts"
import type { CommitPrefix } from "../schema/git-message.schema.model.ts"

export interface PrefixRepo {
  readonly list: Effect.Effect<ReadonlyArray<CommitPrefix>, StorageError>
  readonly add: (
    value: string,
    description: string | null
  ) => Effect.Effect<CommitPrefix, StorageError>
  readonly update: (
    id: string,
    value: string,
    description: string | null
  ) => Effect.Effect<CommitPrefix, StorageError | NotFound>
  readonly remove: (id: string) => Effect.Effect<void, StorageError | NotFound>
}

export class PrefixRepository extends Context.Service<
  PrefixRepository,
  PrefixRepo
>()("PrefixRepository") {}
