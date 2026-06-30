import * as Layer from "effect/Layer"
import { DocsRepository } from "../repository/docs.repository.ts"
import { makeMemoryDocsRepository } from "../repository/docs.repository.memory.ts"
import { DocsService, make } from "../service/docs.service.ts"

export const DocsMemory = (
  seed: ReadonlyArray<{ id: string; content: string }> = []
) =>
  Layer.effect(DocsService)(make).pipe(
    Layer.provide(Layer.effect(DocsRepository)(makeMemoryDocsRepository(seed)))
  )
