import type { CommitInfo } from "@/lib/api/types"
import { DEFAULT_GRAPH_CONFIG } from "../entity/commit-graph.interfaces"
import type {
  CommitGraphConfig,
  CommitGraphDependencies,
} from "../entity/commit-graph.interfaces"

export const createCommitGraphDependenciesMock = (
  overrides?: Partial<CommitGraphConfig>,
): CommitGraphDependencies => ({
  data: { ...DEFAULT_GRAPH_CONFIG, ...overrides },
  sideEffects: {},
})

/** Build a minimal CommitInfo for layout tests — only sha/parents matter. */
export const fakeCommit = (
  sha: string,
  parents: ReadonlyArray<string> = [],
): CommitInfo =>
  ({
    sha,
    shortSha: sha.slice(0, 7),
    author: "tester",
    authoredAt: "",
    subject: sha,
    refs: [],
    parents,
  }) as unknown as CommitInfo
