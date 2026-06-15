import * as Layer from "effect/Layer"
import { CommentsRepository } from "../repository/comments.repository.ts"
import { makeSqliteCommentsRepository } from "../repository/comments.repository.sqlite.ts"
import { CommentsService, make } from "../service/comments.service.ts"

export const CommentsLive = Layer.effect(CommentsService)(make).pipe(
  Layer.provide(Layer.effect(CommentsRepository)(makeSqliteCommentsRepository))
)
