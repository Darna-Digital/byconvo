import * as Layer from "effect/Layer"
import { PrefixRepository } from "../repository/prefix.repository.ts"
import { makeFilePrefixRepository } from "../repository/prefix.repository.file.ts"
import { GitMessageService, make } from "../service/git-message.service.ts"

export const GitMessageLive = Layer.effect(GitMessageService)(make).pipe(
  Layer.provide(Layer.effect(PrefixRepository)(makeFilePrefixRepository))
)
