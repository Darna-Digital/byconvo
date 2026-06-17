import * as Layer from "effect/Layer"
import { CommentsRepository } from "../repository/comments.repository.ts"
import { makeFileCommentsRepository } from "../repository/comments.repository.file.ts"
import { CommentsService, make } from "../service/comments.service.ts"

export const CommentsLive = Layer.effect(CommentsService)(make).pipe(
  Layer.provide(Layer.effect(CommentsRepository)(makeFileCommentsRepository))
)
