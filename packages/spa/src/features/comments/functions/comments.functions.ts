import type {
  CommentsDependencies,
  CommentsFunctions,
} from "../entity/comments.interfaces"

export function createCommentsFunctions(d: CommentsDependencies): CommentsFunctions {
  const submit: CommentsFunctions["submit"] = async (ctx, location, body) => {
    if (ctx.mode === "review" && ctx.selectedPull !== null) {
      return d.sideEffects.addPullComment(ctx.selectedPull.number, {
        filePath: location.filePath,
        side: location.side,
        lineNumber: location.lineNumber,
        body,
      })
    }
    return d.sideEffects.addLocalComment({
      filePath: location.filePath,
      side: location.side,
      lineNumber: location.lineNumber,
      body,
      target: ctx.targetKey,
    })
  }

  const remove: CommentsFunctions["remove"] = async (comment) => {
    if (comment.source !== "local") return false
    await d.sideEffects.deleteComment(comment.id)
    return true
  }

  const reply: CommentsFunctions["reply"] = async (selectedPull, comment, body) => {
    if (selectedPull === null || comment.source !== "github") return null
    const commentId = Number(comment.id.replace(/^gh-/, ""))
    if (!Number.isInteger(commentId)) return null
    const created = await d.sideEffects.replyPullComment(selectedPull.number, commentId, body)
    // Anchor the reply to the parent's line so it lands in the same thread even
    // when GitHub reports a null position for an outdated diff.
    return {
      ...created,
      filePath: comment.filePath,
      side: comment.side,
      lineNumber: comment.lineNumber,
    }
  }

  return { submit, remove, reply }
}
