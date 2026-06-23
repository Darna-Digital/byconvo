/**
 * `diff` feature — the pure derivations that drove the old `App.tsx` `useMemo`s:
 * which diff to render, how to parse it, and what to show in the file tree.
 * Logic only; the unified-diff parser (@pierre/diffs) is injected as a side
 * effect so the functions stay testable without the real renderer.
 */
import type { FileDiffMetadata } from "@pierre/diffs"
import type {
  AppMode,
  DiffTarget,
  GitFileStatus,
  GitStatusEntry,
  PullRequestInfo,
  ReviewComment,
} from "@/lib/api/types"

/** What the user has navigated to — the route state, normalised. */
export interface DiffSelection {
  readonly mode: AppMode
  readonly selectedPull: PullRequestInfo | null
  readonly browse:
    | {
        readonly kind: "commit"
        readonly sha: string
        readonly shortSha: string
      }
    | { readonly kind: "range"; readonly base: string; readonly head: string }
    | null
}

export interface TreeInputs {
  readonly mode: AppMode
  readonly allPaths: ReadonlyArray<string>
  readonly gitStatus: ReadonlyArray<GitStatusEntry>
  readonly parsedFiles: ReadonlyArray<FileDiffMetadata>
  /**
   * Files carrying a local worktree comment. In commit mode these appear in the
   * tree even with no git change, so a reviewer can revisit comments left while
   * browsing. Defaults to none.
   */
  readonly commentedPaths?: ReadonlyArray<string>
}

export interface DiffDependencies {
  data: {
    /** Path prefix hidden from review surfaces (byconvo's own comment store). */
    readonly internalDir: string
  }
  sideEffects: {
    /** Parse a raw unified diff into per-file metadata. */
    readonly parsePatch: (diffText: string) => ReadonlyArray<FileDiffMetadata>
  }
}

export interface DiffFunctions {
  /** Derive the diff target purely from the current navigation selection. */
  readonly deriveTarget: (selection: DiffSelection) => DiffTarget | null
  /** Parse diff text into files, tolerating empty/invalid input. */
  readonly parseFiles: (
    diffText: string | null
  ) => ReadonlyArray<FileDiffMetadata>
  /** Is this path byconvo-internal (and thus hidden)? */
  readonly isInternalPath: (path: string) => boolean
  /** Paths the sidebar tree should list for the current mode. */
  readonly treePaths: (inputs: TreeInputs) => ReadonlyArray<string>
  /** Git-status badges the tree should show for the current mode. */
  readonly treeGitStatus: (inputs: TreeInputs) => ReadonlyArray<GitStatusEntry>
  /** Changed files for the commit panel. */
  readonly changedFiles: (
    gitStatus: ReadonlyArray<GitStatusEntry>
  ) => ReadonlyArray<GitStatusEntry>
  /** Comments visible for the given target. */
  readonly visibleComments: (args: {
    readonly targetKind: DiffTarget["kind"] | null
    readonly targetKey: string
    readonly localComments: ReadonlyArray<ReviewComment>
    readonly pullComments: ReadonlyArray<ReviewComment>
  }) => ReadonlyArray<ReviewComment>
}

/** Map a parsed-diff file change type to a git status badge. */
export const fileTypeToStatus = (
  type: FileDiffMetadata["type"]
): GitFileStatus =>
  type === "new"
    ? "added"
    : type === "deleted"
      ? "deleted"
      : type === "rename-pure" || type === "rename-changed"
        ? "renamed"
        : "modified"
