/**
 * HTTP API — routes the client talks to, mounted under /api.
 */
import { Effect } from "effect"
import * as FileSystem from "effect/FileSystem"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { resolve as pathResolve } from "node:path"
import { Comments } from "./Comments.js"
import type { CommentSide } from "./domain.js"
import { Git } from "./Git.js"
import { GitHub } from "./GitHub.js"
import { Workspace } from "./Workspace.js"

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/** Send an effect's result as JSON; report any failure as a 500 with details. */
const json = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.map((data) => HttpServerResponse.jsonUnsafe(data)),
    Effect.catch((error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
      )
    )
  )

/** Send an effect's string result as plain text; report failures as 500s. */
const text = <E, R>(effect: Effect.Effect<string, E, R>) =>
  effect.pipe(
    Effect.map((body) => HttpServerResponse.text(body)),
    Effect.catch((error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
      )
    )
  )

const searchParams = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, "http://localhost").searchParams

const badRequest = (reason: string) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ error: reason }, { status: 400 }))

const isCommentSide = (value: unknown): value is CommentSide =>
  value === "deletions" || value === "additions"

export const ApiRoutes = HttpRouter.use((router) =>
  Effect.gen(function*() {
    const git = yield* Git
    const comments = yield* Comments
    const github = yield* GitHub
    const workspace = yield* Workspace

    yield* router.add("GET", "/api/workspace", json(workspace.info))

    yield* router.add("POST", "/api/workspace", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        const path = typeof body === "object" && body !== null && "path" in body
          ? body.path
          : null
        if (typeof path !== "string" || path.length === 0) {
          return yield* badRequest("expected { path: string }")
        }
        return yield* workspace.setCurrent(path).pipe(
          Effect.map((info) => HttpServerResponse.jsonUnsafe(info)),
          Effect.catchTag("InvalidRepo", (error) =>
            Effect.succeed(
              HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })
            ))
        )
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("GET", "/api/fs/browse", (request) => {
      const path = searchParams(request).get("path")
      return json(workspace.browse(path))
    })

    yield* router.add("GET", "/api/file", (request) => {
      const path = searchParams(request).get("path")
      if (path === null || path.length === 0) return badRequest("missing file path")
      return json(workspace.readFile(path))
    })

    yield* router.add("PUT", "/api/file", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { path: string, contents: string }")
        }
        const { contents, path } = body as Record<string, unknown>
        if (typeof path !== "string" || path.length === 0 || typeof contents !== "string") {
          return yield* badRequest("expected { path: string, contents: string }")
        }
        return yield* json(Effect.as(workspace.writeFile(path, contents), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("DELETE", "/api/file", (request) => {
      const path = searchParams(request).get("path")
      if (path === null || path.length === 0) return badRequest("missing file path")
      return json(Effect.as(workspace.deletePath(path), { ok: true }))
    })

    yield* router.add("POST", "/api/file/rename", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { from: string, to: string }")
        }
        const { from, to } = body as Record<string, unknown>
        if (
          typeof from !== "string" || from.length === 0 ||
          typeof to !== "string" || to.length === 0
        ) {
          return yield* badRequest("expected { from: string, to: string }")
        }
        return yield* json(Effect.as(workspace.renamePath(from, to), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("GET", "/api/repo", json(git.info))
    yield* router.add("GET", "/api/files", json(git.files))
    yield* router.add("GET", "/api/status", json(git.status))
    yield* router.add("GET", "/api/branches", json(git.branches))
    yield* router.add("GET", "/api/remote-branches", json(git.remoteBranches))

    yield* router.add("POST", "/api/branch", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { name: string, startPoint?: string }")
        }
        const { name, startPoint } = body as Record<string, unknown>
        if (typeof name !== "string" || name.trim().length === 0) {
          return yield* badRequest("branch name must not be empty")
        }
        const from = typeof startPoint === "string" && startPoint.length > 0
          ? startPoint
          : null
        return yield* json(Effect.as(git.createBranch(name.trim(), from), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/branch/rename", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { from: string, to: string }")
        }
        const { from, to } = body as Record<string, unknown>
        if (
          typeof from !== "string" || from.length === 0 ||
          typeof to !== "string" || to.trim().length === 0
        ) {
          return yield* badRequest("expected { from: string, to: string }")
        }
        return yield* json(Effect.as(git.renameBranch(from, to.trim()), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/branch/delete", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { name: string, force?: boolean }")
        }
        const { name, force } = body as Record<string, unknown>
        if (typeof name !== "string" || name.length === 0) {
          return yield* badRequest("branch name must not be empty")
        }
        return yield* json(Effect.as(git.deleteBranch(name, force === true), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/fetch", json(Effect.map(git.fetch, (output) => ({ output }))))

    yield* router.add("POST", "/api/merge", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        const branch = typeof body === "object" && body !== null && "branch" in body
          ? body.branch
          : null
        if (typeof branch !== "string" || branch.length === 0) {
          return yield* badRequest("expected { branch: string }")
        }
        return yield* json(Effect.map(git.merge(branch), (output) => ({ output })))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/rebase", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        const onto = typeof body === "object" && body !== null && "onto" in body
          ? body.onto
          : null
        if (typeof onto !== "string" || onto.length === 0) {
          return yield* badRequest("expected { onto: string }")
        }
        return yield* json(Effect.map(git.rebase(onto), (output) => ({ output })))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("GET", "/api/log", (request) => {
      const params = searchParams(request)
      const trimmed = (key: string): string | null => {
        const value = params.get(key)
        return value !== null && value.trim().length > 0 ? value.trim() : null
      }
      return json(git.log({
        ref: params.get("ref") ?? "HEAD",
        limit: Math.min(Number(params.get("limit") ?? 50) || 50, 200),
        author: trimmed("author"),
        grep: trimmed("grep"),
        regex: params.get("regex") === "1",
        caseSensitive: params.get("case") === "1",
        after: trimmed("after"),
        before: trimmed("before"),
        path: trimmed("path")
      }))
    })

    yield* router.add("GET", "/api/commit/:sha", () =>
      Effect.gen(function*() {
        const routeParams = yield* HttpRouter.params
        const sha = routeParams["sha"]
        if (sha === undefined || sha.length === 0) return yield* badRequest("missing commit sha")
        return yield* json(git.commitDetail(sha))
      }))

    yield* router.add("GET", "/api/diff", (request) => {
      const params = searchParams(request)
      const commit = params.get("commit")
      if (commit !== null) return text(git.commitDiff(commit))
      const base = params.get("base")
      const head = params.get("head")
      if (base !== null && head !== null) return text(git.rangeDiff(base, head))
      return text(git.worktreeDiff)
    })

    yield* router.add("POST", "/api/checkout", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        const branch = typeof body === "object" && body !== null && "branch" in body
          ? body.branch
          : null
        if (typeof branch !== "string" || branch.length === 0) {
          return yield* badRequest("expected { branch: string }")
        }
        return yield* json(Effect.as(git.checkout(branch), { ok: true }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/commit", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected { message: string, paths?: string[] }")
        }
        const { message, paths } = body as Record<string, unknown>
        if (typeof message !== "string" || message.trim().length === 0) {
          return yield* badRequest("commit message must not be empty")
        }
        const pathList = Array.isArray(paths)
          ? paths.filter((entry): entry is string => typeof entry === "string")
          : []
        return yield* json(
          Effect.map(git.commit(message.trim(), pathList), (sha) => ({ sha }))
        )
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("POST", "/api/push", json(Effect.map(git.push, (output) => ({ output }))))

    yield* router.add("POST", "/api/pull", json(Effect.map(git.pull, (output) => ({ output }))))

    yield* router.add("GET", "/api/comments", json(comments.list))

    yield* router.add("POST", "/api/comments", (request) =>
      Effect.gen(function*() {
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected a comment object")
        }
        const { author, body: commentBody, filePath, lineNumber, side, target } = body as Record<string, unknown>
        if (
          typeof filePath !== "string" ||
          typeof commentBody !== "string" ||
          commentBody.length === 0 ||
          typeof lineNumber !== "number" ||
          !isCommentSide(side)
        ) {
          return yield* badRequest(
            "expected { filePath: string, body: string, lineNumber: number, side: 'deletions' | 'additions' }"
          )
        }
        return yield* json(comments.add({
          filePath,
          body: commentBody,
          lineNumber,
          side,
          author: typeof author === "string" && author.length > 0 ? author : "you",
          target: typeof target === "string" ? target : "worktree"
        }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    yield* router.add("DELETE", "/api/comments/:id", () =>
      Effect.gen(function*() {
        const params = yield* HttpRouter.params
        const id = params["id"]
        if (id === undefined) return yield* badRequest("missing comment id")
        return yield* json(Effect.as(comments.remove(id), { ok: true }))
      }))

    yield* router.add("GET", "/api/github/pulls", json(github.pulls))

    yield* router.add("GET", "/api/github/pulls/:number/diff", () =>
      Effect.gen(function*() {
        const params = yield* HttpRouter.params
        const pullNumber = Number(params["number"])
        if (!Number.isInteger(pullNumber)) return yield* badRequest("invalid PR number")
        return yield* text(github.pullDiff(pullNumber))
      }))

    yield* router.add("GET", "/api/github/pulls/:number/comments", () =>
      Effect.gen(function*() {
        const params = yield* HttpRouter.params
        const pullNumber = Number(params["number"])
        if (!Number.isInteger(pullNumber)) return yield* badRequest("invalid PR number")
        return yield* json(github.pullComments(pullNumber))
      }))

    yield* router.add("POST", "/api/github/pulls/:number/comments", (request) =>
      Effect.gen(function*() {
        const params = yield* HttpRouter.params
        const pullNumber = Number(params["number"])
        if (!Number.isInteger(pullNumber)) return yield* badRequest("invalid PR number")
        const body = yield* request.json
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return yield* badRequest("expected a comment object")
        }
        const { body: commentBody, filePath, lineNumber, side } = body as Record<string, unknown>
        if (
          typeof filePath !== "string" ||
          typeof commentBody !== "string" ||
          typeof lineNumber !== "number" ||
          !isCommentSide(side)
        ) {
          return yield* badRequest(
            "expected { filePath: string, body: string, lineNumber: number, side: 'deletions' | 'additions' }"
          )
        }
        return yield* json(github.createPullComment({
          pullNumber,
          filePath,
          body: commentBody,
          lineNumber,
          side
        }))
      }).pipe(Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe({ error: errorMessage(error) }, { status: 500 })
        )
      )))

    // When a built client is provided (desktop/production), serve it from the
    // same origin so the app can load over http://localhost:PORT with no CORS.
    const clientDir = process.env["CODEDIFF_CLIENT_DIR"]
    if (clientDir !== undefined && clientDir.length > 0) {
      const fs = yield* FileSystem.FileSystem
      const root = pathResolve(clientDir)
      const indexHtml = `${root}/index.html`

      const serveStatic = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function*() {
          const pathname = new URL(request.url, "http://localhost").pathname
          const candidate = pathResolve(`${root}${pathname}`)
          // Serve the requested asset when it exists and stays within the
          // client dir; otherwise fall back to index.html for SPA routes.
          const useFile = candidate !== root &&
            (candidate === indexHtml || candidate.startsWith(`${root}/`)) &&
            (yield* fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false)))) &&
            (yield* fs.stat(candidate).pipe(
              Effect.map((info) => info.type === "File"),
              Effect.catch(() => Effect.succeed(false))
            ))
          return yield* HttpServerResponse.file(useFile ? candidate : indexHtml)
        }).pipe(Effect.catch(() =>
          Effect.succeed(HttpServerResponse.text("not found", { status: 404 }))
        ))

      yield* router.add("GET", "/", serveStatic)
      yield* router.add("GET", "/*", serveStatic)
    }
  })
)
