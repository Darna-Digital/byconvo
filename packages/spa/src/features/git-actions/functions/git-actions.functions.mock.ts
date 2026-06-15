import { vi } from "vitest"
import type { GitActionsDependencies } from "../entity/git-actions.interfaces"

export const createGitActionsDependenciesMock = (
  overrides?: Partial<GitActionsDependencies["sideEffects"]>
): GitActionsDependencies => ({
  data: {},
  sideEffects: {
    commit: vi.fn(async () => ({ sha: "abc1234" })),
    push: vi.fn(async () => ({ output: "pushed" })),
    notify: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  },
})
