/**
 * File-backed docs store — each doc is a markdown file under `.byconvo/docs/`
 * in the selected repository, so agents and the local `claude` CLI can read and
 * write plans straight on disk. The doc id is the file's slug; the title is its
 * first markdown heading (falling back to the id).
 */
import * as Effect from "effect/Effect"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { NotFound, StorageError } from "../../../layers/errors.ts"
import { WorkspaceContext } from "../../../layers/workspace/workspace-context.ts"
import type { Doc } from "../schema/docs.schema.model.ts"
import type { DocsRepo } from "./docs.repository.ts"

const docsDir = (repoPath: string) => `${repoPath}/.byconvo/docs`
const docPath = (repoPath: string, id: string) =>
  `${docsDir(repoPath)}/${id}.md`

const slugify = (title: string) => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug.length > 0 ? slug : "doc"
}

const titleFromContent = (content: string, id: string) => {
  const heading = content.match(/^#\s+(.+)$/m)
  return heading?.[1].trim() ?? id
}

const readDoc = (repoPath: string, id: string): Doc => {
  const path = docPath(repoPath, id)
  if (!existsSync(path)) {
    throw new NotFound({ reason: `doc ${id} not found` })
  }
  const content = readFileSync(path, "utf8")
  return {
    id,
    title: titleFromContent(content, id),
    content,
    updatedAt: statSync(path).mtime.toISOString(),
  }
}

const uniqueId = (repoPath: string, base: string) => {
  let id = base
  let n = 1
  while (existsSync(docPath(repoPath, id))) {
    n += 1
    id = `${base}-${n}`
  }
  return id
}

export const makeFileDocsRepository = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext

  const withFile = <A>(f: (repoPath: string) => A) =>
    Effect.flatMap(ctx.requireCurrent, (repoPath) =>
      Effect.try({
        try: () => f(repoPath),
        catch: (error) =>
          error instanceof NotFound
            ? error
            : new StorageError({
                reason: error instanceof Error ? error.message : String(error),
              }),
      })
    )

  const list: DocsRepo["list"] = withFile((repoPath) => {
    const dir = docsDir(repoPath)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => {
        const id = name.slice(0, -3)
        const doc = readDoc(repoPath, id)
        return { id: doc.id, title: doc.title, updatedAt: doc.updatedAt }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })

  const get: DocsRepo["get"] = (id) =>
    withFile((repoPath) => readDoc(repoPath, id))

  const create: DocsRepo["create"] = (title) =>
    withFile((repoPath) => {
      mkdirSync(docsDir(repoPath), { recursive: true })
      const id = uniqueId(repoPath, slugify(title))
      const heading = title.trim().length > 0 ? title.trim() : "Untitled plan"
      writeFileSync(docPath(repoPath, id), `# ${heading}\n\n`)
      return readDoc(repoPath, id)
    })

  const update: DocsRepo["update"] = (id, content) =>
    withFile((repoPath) => {
      if (!existsSync(docPath(repoPath, id))) {
        throw new NotFound({ reason: `doc ${id} not found` })
      }
      writeFileSync(docPath(repoPath, id), content)
      return readDoc(repoPath, id)
    })

  const remove: DocsRepo["remove"] = (id) =>
    withFile((repoPath) => {
      rmSync(docPath(repoPath, id), { force: true })
    })

  return { list, get, create, update, remove } satisfies DocsRepo
})
