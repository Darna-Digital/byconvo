import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../../../api.ts"
import type { LogQuery } from "../schema/repo.schema.requests.ts"
import { RepoService } from "../service/repo.service.ts"

const ok = { ok: true } as const
const trimmed = (value: string | undefined): string | null =>
  value !== undefined && value.trim().length > 0 ? value.trim() : null

export const RepoController = HttpApiBuilder.group(Api, "repo", (handlers) =>
  handlers
    .handle("info", () => Effect.flatMap(RepoService, (s) => s.info))
    .handle("files", () => Effect.flatMap(RepoService, (s) => s.files))
    .handle("status", () => Effect.flatMap(RepoService, (s) => s.status))
    .handle("branches", () => Effect.flatMap(RepoService, (s) => s.branches))
    .handle("remoteBranches", () => Effect.flatMap(RepoService, (s) => s.remoteBranches))
    .handle("log", ({ query }) => {
      const q: LogQuery = {
        ref: query.ref ?? "HEAD",
        limit: Math.min(Number(query.limit ?? 50) || 50, 200),
        author: trimmed(query.author),
        grep: trimmed(query.grep),
        regex: query.regex === "1",
        caseSensitive: query.case === "1",
        after: trimmed(query.after),
        before: trimmed(query.before),
        path: trimmed(query.path),
      }
      return Effect.flatMap(RepoService, (s) => s.log(q))
    })
    .handle("commitDetail", ({ params }) =>
      Effect.flatMap(RepoService, (s) => s.commitDetail(params.sha)),
    )
    .handle("diff", ({ query }) =>
      Effect.flatMap(RepoService, (s) => {
        if (query.commit !== undefined) return s.commitDiff(query.commit)
        if (query.base !== undefined && query.head !== undefined) {
          return s.rangeDiff(query.base, query.head)
        }
        return s.worktreeDiff
      }),
    )
    .handle("checkout", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.checkout(payload.branch)).pipe(Effect.as(ok)),
    )
    .handle("commit", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.commit(payload.message, payload.paths ?? [])).pipe(
        Effect.map((sha) => ({ sha })),
      ),
    )
    .handle("push", () =>
      Effect.flatMap(RepoService, (s) => s.push).pipe(Effect.map((output) => ({ output }))),
    )
    .handle("pull", () =>
      Effect.flatMap(RepoService, (s) => s.pull).pipe(Effect.map((output) => ({ output }))),
    )
    .handle("fetch", () =>
      Effect.flatMap(RepoService, (s) => s.fetch).pipe(Effect.map((output) => ({ output }))),
    )
    .handle("merge", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.merge(payload.branch)).pipe(
        Effect.map((output) => ({ output })),
      ),
    )
    .handle("rebase", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.rebase(payload.onto)).pipe(
        Effect.map((output) => ({ output })),
      ),
    )
    .handle("createBranch", ({ payload }) =>
      Effect.flatMap(RepoService, (s) =>
        s.createBranch(payload.name, payload.startPoint ?? null),
      ).pipe(Effect.as(ok)),
    )
    .handle("renameBranch", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.renameBranch(payload.from, payload.to)).pipe(
        Effect.as(ok),
      ),
    )
    .handle("deleteBranch", ({ payload }) =>
      Effect.flatMap(RepoService, (s) => s.deleteBranch(payload.name, payload.force ?? false)).pipe(
        Effect.as(ok),
      ),
    ),
)
