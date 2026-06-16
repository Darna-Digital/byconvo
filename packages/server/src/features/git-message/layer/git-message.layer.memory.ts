import * as Layer from "effect/Layer"
import { PrefixRepository } from "../repository/prefix.repository.ts"
import { makeMemoryPrefixRepository } from "../repository/prefix.repository.memory.ts"
import type { CommitPrefix } from "../schema/git-message.schema.model.ts"
import { GitMessageService, make } from "../service/git-message.service.ts"

/**
 * Test layer: in-memory prefixes plus whatever GitExec/ClaudeExec the test
 * provides (e.g. the memory variants), so the service can be exercised without
 * touching the real git repo, the filesystem, or the `claude` CLI.
 */
export const GitMessageMemory = (seed: ReadonlyArray<CommitPrefix> = []) =>
  Layer.effect(GitMessageService)(make).pipe(
    Layer.provide(
      Layer.effect(PrefixRepository)(makeMemoryPrefixRepository(seed))
    )
  )
