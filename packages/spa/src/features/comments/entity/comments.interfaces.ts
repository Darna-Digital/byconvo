/**
 * `comments` feature — submitting, deleting and replying to review comments.
 * Which store a comment lands in (local vs GitHub PR) and how a PR reply is
 * anchored to its parent line is real business logic, so it lives here behind
 * injected side effects (the API mutations).
 */
import type { AppMode, CommentSide, PullRequestInfo, ReviewComment } from "@/lib/api/types"

export interface DraftLocation {
  readonly filePath: string
  readonly side: CommentSide
  readonly lineNumber: number
}

export interface SubmitContext {
  readonly mode: AppMode
  readonly selectedPull: PullRequestInfo | null
  readonly targetKey: string
}

export interface CommentsDependencies {
  data: Record<string, never>
  sideEffects: {
    readonly addLocalComment: (input: {
      filePath: string
      side: CommentSide
      lineNumber: number
      body: string
      target: string
    }) => Promise<ReviewComment>
    readonly addPullComment: (
      pullNumber: number,
      input: { filePath: string; side: CommentSide; lineNumber: number; body: string },
    ) => Promise<ReviewComment>
    readonly deleteComment: (id: string) => Promise<void>
    readonly replyPullComment: (
      pullNumber: number,
      commentId: number,
      body: string,
    ) => Promise<ReviewComment>
  }
}

export interface CommentsFunctions {
  /** Create a comment in the right store; returns the created comment. */
  readonly submit: (
    ctx: SubmitContext,
    location: DraftLocation,
    body: string,
  ) => Promise<ReviewComment>
  /** Delete a comment — only local comments are deletable; returns true if removed. */
  readonly remove: (comment: ReviewComment) => Promise<boolean>
  /** Reply to a GitHub PR comment, anchored to its parent's line. */
  readonly reply: (
    selectedPull: PullRequestInfo | null,
    comment: ReviewComment,
    body: string,
  ) => Promise<ReviewComment | null>
}
