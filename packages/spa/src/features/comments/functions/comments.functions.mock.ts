import { vi } from "vitest"
import type { CommentSide, ReviewComment } from "@/lib/api/types"
import type { CommentsDependencies } from "../entity/comments.interfaces"

const comment = (over: Partial<ReviewComment>): ReviewComment => ({
  id: "c1",
  filePath: "a.ts",
  side: "additions",
  lineNumber: 1,
  body: "",
  author: "you",
  createdAt: "2026-01-01T00:00:00Z",
  target: "worktree",
  source: "local",
  ...over,
})

export const createCommentsDependenciesMock = (): CommentsDependencies => ({
  data: {},
  sideEffects: {
    addLocalComment: vi.fn(async (input) =>
      comment({ ...input, id: "local-1", source: "local" })
    ),
    addPullComment: vi.fn(async (pullNumber, input) =>
      comment({
        ...input,
        id: "pr-new",
        source: "github",
        target: `pr-${pullNumber}`,
      })
    ),
    deleteComment: vi.fn(async () => undefined),
    replyPullComment: vi.fn(async (pullNumber, _commentId, body) =>
      comment({
        id: "pr-reply",
        body,
        source: "github",
        target: `pr-${pullNumber}`,
        filePath: "",
        lineNumber: 0,
      })
    ),
  },
})
