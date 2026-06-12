/**
 * HTTP API — routes the client talks to, mounted under /api.
 */
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Comments } from "./Comments.js"
import type { CommentSide } from "./domain.js"
import { Git } from "./Git.js"
import { GitHub } from "./GitHub.js"

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

    yield* router.add("GET", "/api/repo", json(git.info))
    yield* router.add("GET", "/api/files", json(git.files))
    yield* router.add("GET", "/api/branches", json(git.branches))

    yield* router.add("GET", "/api/log", (request) => {
      const params = searchParams(request)
      const ref = params.get("ref") ?? "HEAD"
      const limit = Math.min(Number(params.get("limit") ?? 50) || 50, 200)
      return json(git.log(ref, limit))
    })

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
  })
)
