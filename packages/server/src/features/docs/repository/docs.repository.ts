/** Markdown-docs store contract. */
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  NoRepoSelected,
  NotFound,
  StorageError,
} from "../../../layers/errors.ts"
import type { Doc, DocSummary } from "../schema/docs.schema.model.ts"

export type DocsFailure = NoRepoSelected | NotFound | StorageError

export interface DocsRepo {
  readonly list: Effect.Effect<ReadonlyArray<DocSummary>, DocsFailure>
  readonly get: (id: string) => Effect.Effect<Doc, DocsFailure>
  readonly create: (title: string) => Effect.Effect<Doc, DocsFailure>
  readonly update: (
    id: string,
    content: string
  ) => Effect.Effect<Doc, DocsFailure>
  readonly remove: (id: string) => Effect.Effect<void, DocsFailure>
}

export class DocsRepository extends Context.Service<DocsRepository, DocsRepo>()(
  "DocsRepository"
) {}
