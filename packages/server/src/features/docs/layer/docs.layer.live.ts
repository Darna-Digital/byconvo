import * as Layer from "effect/Layer"
import { DocsRepository } from "../repository/docs.repository.ts"
import { makeFileDocsRepository } from "../repository/docs.repository.file.ts"
import { DocsService, make } from "../service/docs.service.ts"

export const DocsLive = Layer.effect(DocsService)(make).pipe(
  Layer.provide(Layer.effect(DocsRepository)(makeFileDocsRepository))
)
