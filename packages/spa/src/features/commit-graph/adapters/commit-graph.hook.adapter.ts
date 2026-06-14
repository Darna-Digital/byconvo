import { useMemo } from "react"
import type { CommitInfo } from "@/lib/api/types"
import { DEFAULT_GRAPH_CONFIG } from "../entity/commit-graph.interfaces"
import type {
  CommitGraphConfig,
  CommitGraphLayout,
} from "../entity/commit-graph.interfaces"
import { createCommitGraphFunctions } from "../functions/commit-graph.functions"

/** The pure graph functions, memoised over the (static) config. */
export function useCommitGraphFunctions(config: CommitGraphConfig = DEFAULT_GRAPH_CONFIG) {
  return useMemo(
    () => createCommitGraphFunctions({ data: config, sideEffects: {} }),
    [config],
  )
}

/** Memoised swim-lane layout for a commit list. */
export function useCommitGraph(
  commits: ReadonlyArray<CommitInfo>,
  config: CommitGraphConfig = DEFAULT_GRAPH_CONFIG,
): { layout: CommitGraphLayout; functions: ReturnType<typeof createCommitGraphFunctions> } {
  const functions = useCommitGraphFunctions(config)
  const layout = useMemo(() => functions.buildLayout(commits), [functions, commits])
  return { layout, functions }
}
