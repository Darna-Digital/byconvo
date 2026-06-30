/** In-memory docs store for tests. */
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import { NotFound } from "../../../layers/errors.ts"
import type { Doc } from "../schema/docs.schema.model.ts"
import type { DocsRepo } from "./docs.repository.ts"

const NOW = "2026-01-01T00:00:00.000Z"

const slugify = (title: string) => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug.length > 0 ? slug : "doc"
}

const titleFromContent = (content: string, id: string) =>
  content.match(/^#\s+(.+)$/m)?.[1].trim() ?? id

interface Stored {
  readonly id: string
  readonly content: string
}

export const makeMemoryDocsRepository = (seed: ReadonlyArray<Stored> = []) =>
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Stored>>([...seed])

    const toDoc = (s: Stored): Doc => ({
      id: s.id,
      title: titleFromContent(s.content, s.id),
      content: s.content,
      updatedAt: NOW,
    })

    const find = (all: ReadonlyArray<Stored>, id: string) => {
      const s = all.find((d) => d.id === id)
      return s === undefined
        ? Effect.fail(new NotFound({ reason: `doc ${id} not found` }))
        : Effect.succeed(s)
    }

    const repo: DocsRepo = {
      list: Ref.get(store).pipe(
        Effect.map((all) =>
          all
            .map((s) => {
              const doc = toDoc(s)
              return { id: doc.id, title: doc.title, updatedAt: doc.updatedAt }
            })
            .sort((a, b) => a.id.localeCompare(b.id))
        )
      ),
      get: (id) =>
        Effect.flatMap(Ref.get(store), (all) =>
          Effect.map(find(all, id), toDoc)
        ),
      create: (title) =>
        Effect.gen(function* () {
          const all = yield* Ref.get(store)
          let id = slugify(title)
          let n = 1
          while (all.some((d) => d.id === id)) {
            n += 1
            id = `${slugify(title)}-${n}`
          }
          const heading =
            title.trim().length > 0 ? title.trim() : "Untitled plan"
          const stored: Stored = { id, content: `# ${heading}\n\n` }
          yield* Ref.update(store, (existing) => [...existing, stored])
          return toDoc(stored)
        }),
      update: (id, content) =>
        Effect.gen(function* () {
          yield* find(yield* Ref.get(store), id)
          const stored: Stored = { id, content }
          yield* Ref.update(store, (all) =>
            all.map((d) => (d.id === id ? stored : d))
          )
          return toDoc(stored)
        }),
      remove: (id) =>
        Ref.update(store, (all) => all.filter((d) => d.id !== id)),
    }
    return repo
  })
