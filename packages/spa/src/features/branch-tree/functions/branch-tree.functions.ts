import type {
  BranchFolder,
  BranchLeaf,
  BranchTreeDependencies,
  BranchTreeFunctions,
  BranchTreeItem,
} from "../entity/branch-tree.interfaces"

interface MutableFolder {
  kind: "folder"
  label: string
  path: string
  children: Array<MutableFolder | BranchLeaf>
}

const sortTree = (
  items: Array<MutableFolder | BranchLeaf>,
  favorites: ReadonlySet<string>,
): Array<BranchTreeItem> => {
  const score = (item: MutableFolder | BranchLeaf) => {
    // Folders before leaves; favourite branches float above the rest.
    if (item.kind === "folder") return 0
    return favorites.has(item.fullName) ? 1 : 2
  }
  return [...items]
    .sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label))
    .map((item) =>
      item.kind === "folder"
        ? { ...item, children: sortTree(item.children, favorites) }
        : item,
    )
}

const buildLeafTree = (
  leaves: ReadonlyArray<{ segments: ReadonlyArray<string>; leaf: BranchLeaf }>,
  favorites: ReadonlySet<string>,
): Array<BranchTreeItem> => {
  const root: MutableFolder = { kind: "folder", label: "", path: "", children: [] }
  const folderAt = (parent: MutableFolder, name: string, path: string): MutableFolder => {
    const existing = parent.children.find(
      (c): c is MutableFolder => c.kind === "folder" && c.label === name,
    )
    if (existing) return existing
    const created: MutableFolder = { kind: "folder", label: name, path, children: [] }
    parent.children.push(created)
    return created
  }
  for (const { segments, leaf } of leaves) {
    let parent = root
    for (let i = 0; i < segments.length - 1; i++) {
      parent = folderAt(parent, segments[i], segments.slice(0, i + 1).join("/"))
    }
    parent.children.push(leaf)
  }
  return sortTree(root.children, favorites)
}

export function createBranchTreeFunctions(
  _d: BranchTreeDependencies,
): BranchTreeFunctions {
  const matches = (name: string, query: string) =>
    query.length === 0 || name.toLowerCase().includes(query.toLowerCase())

  const buildTrees: BranchTreeFunctions["buildTrees"] = ({
    branches,
    remoteBranches,
    favorites,
    query,
  }) => {
    const q = query.trim()

    const local = buildLeafTree(
      branches
        .filter((branch) => matches(branch.name, q))
        .map((branch) => ({
          segments: branch.name.split("/"),
          leaf: {
            kind: "branch" as const,
            label: branch.name.split("/").at(-1) ?? branch.name,
            fullName: branch.name,
            isCurrent: branch.isCurrent,
            isRemote: false,
            ahead: branch.ahead,
            behind: branch.behind,
          },
        })),
      favorites,
    )

    // Remote branches nest under their remote name (origin/…).
    const remote = buildLeafTree(
      remoteBranches
        .filter((branch) => matches(branch.name, q))
        .map((branch) => ({
          segments: branch.name.split("/"),
          leaf: {
            kind: "branch" as const,
            label: branch.shortName.split("/").at(-1) ?? branch.shortName,
            fullName: branch.name,
            isCurrent: false,
            isRemote: true,
            ahead: 0,
            behind: 0,
          },
        })),
      favorites,
    )

    return { local, remote }
  }

  const flatten: BranchTreeFunctions["flatten"] = (items, isExpanded, depth = 1) => {
    const rows: Array<ReturnType<BranchTreeFunctions["flatten"]>[number]> = []
    for (const item of items) {
      if (item.kind === "folder") {
        const expanded = isExpanded(item.path)
        rows.push({ key: `f:${item.path}`, item, depth, expanded })
        if (expanded) rows.push(...flatten(item.children, isExpanded, depth + 1))
      } else {
        rows.push({ key: `b:${item.fullName}`, item, depth, expanded: false })
      }
    }
    return rows
  }

  const toggleFavorite: BranchTreeFunctions["toggleFavorite"] = (favorites, name) => {
    const next = new Set(favorites)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  }

  const folderPaths: BranchTreeFunctions["folderPaths"] = (items) => {
    const paths: Array<string> = []
    const walk = (nodes: ReadonlyArray<BranchTreeItem>) => {
      for (const node of nodes) {
        if (node.kind === "folder") {
          paths.push(node.path)
          walk(node.children)
        }
      }
    }
    walk(items)
    return paths
  }

  return { buildTrees, flatten, toggleFavorite, folderPaths }
}

export type { BranchFolder, BranchLeaf }
