/**
 * `branch-tree` feature — turns flat local/remote branch lists into the nested,
 * folder-grouped tree the history panel renders (e.g. `task/BMB-207` nests under
 * a `task` folder). Folders sort first, favourited branches float to the top,
 * and a free-text query filters leaves. The tree shaping is pure; favourite
 * persistence (localStorage) is the only side effect and lives in the adapter.
 */
import type { BranchInfo, RemoteBranchInfo } from "@/lib/api/types"

export interface BranchLeaf {
  readonly kind: "branch"
  /** Leaf label shown in the row (last path segment). */
  readonly label: string
  /** Full ref used as the selection key and checkout target. */
  readonly fullName: string
  readonly isCurrent: boolean
  readonly isRemote: boolean
  readonly ahead: number
  readonly behind: number
}

export interface BranchFolder {
  readonly kind: "folder"
  readonly label: string
  readonly path: string
  readonly children: ReadonlyArray<BranchTreeItem>
}

export type BranchTreeItem = BranchLeaf | BranchFolder

export interface BranchTreeInput {
  readonly branches: ReadonlyArray<BranchInfo>
  readonly remoteBranches: ReadonlyArray<RemoteBranchInfo>
  readonly favorites: ReadonlySet<string>
  readonly query: string
}

export interface BranchTrees {
  readonly local: ReadonlyArray<BranchTreeItem>
  readonly remote: ReadonlyArray<BranchTreeItem>
}

/** A flattened, render-ready row honouring the current folder-expansion state. */
export interface FlatBranchRow {
  readonly key: string
  readonly item: BranchTreeItem
  readonly depth: number
  /** Only meaningful for folders. */
  readonly expanded: boolean
}

export interface BranchTreeDependencies {
  readonly data: Record<string, never>
  readonly sideEffects: Record<string, never>
}

export interface BranchTreeFunctions {
  /** Build the grouped local + remote trees for the current favourites/query. */
  readonly buildTrees: (input: BranchTreeInput) => BranchTrees
  /** Walk a tree into the visible rows, expanding folders per `isExpanded`. */
  readonly flatten: (
    items: ReadonlyArray<BranchTreeItem>,
    isExpanded: (path: string) => boolean,
    depth?: number
  ) => ReadonlyArray<FlatBranchRow>
  /** Toggle a branch's favourite membership, returning a new set. */
  readonly toggleFavorite: (
    favorites: ReadonlySet<string>,
    name: string
  ) => Set<string>
  /** All folder paths in a tree — used to auto-expand everything while filtering. */
  readonly folderPaths: (
    items: ReadonlyArray<BranchTreeItem>
  ) => ReadonlyArray<string>
}
