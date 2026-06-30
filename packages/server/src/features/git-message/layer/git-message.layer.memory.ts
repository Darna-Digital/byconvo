import * as Layer from "effect/Layer"
import { GitMessageService, make } from "../service/git-message.service.ts"

/**
 * Test layer: the bare service over whatever GitExec/TerminalExec the test
 * provides (e.g. the memory variants), so it can be exercised without touching
 * the real git repo or spawning a real agent CLI.
 */
export const GitMessageMemory = () => Layer.effect(GitMessageService)(make)
