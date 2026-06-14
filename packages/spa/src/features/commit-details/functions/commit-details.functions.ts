import type { CommitFileChange } from "@/lib/api/types"
import { STATUS_LETTER } from "../entity/commit-details.interfaces"
import type {
  CommitDetailsDependencies,
  CommitDetailsFunctions,
  DetailRow,
} from "../entity/commit-details.interfaces"

interface FileNode {
  name: string
  children: Map<string, FileNode>
  file: CommitFileChange | null
}

const buildFileTree = (files: ReadonlyArray<CommitFileChange>): FileNode => {
  const root: FileNode = { name: "", children: new Map(), file: null }
  for (const file of files) {
    const segments = file.path.split("/")
    let node = root
    segments.forEach((segment, index) => {
      let child = node.children.get(segment)
      if (child === undefined) {
        child = { name: segment, children: new Map(), file: null }
        node.children.set(segment, child)
      }
      if (index === segments.length - 1) child.file = file
      node = child
    })
  }
  return root
}

const countFiles = (node: FileNode): number =>
  node.file !== null
    ? 1
    : [...node.children.values()].reduce(
        (sum, child) => sum + countFiles(child),
        0
      )

// Collapse single-child folder chains into one row (a/b/c).
const collapse = (node: FileNode): { label: string; node: FileNode } => {
  let label = node.name
  let current = node
  while (current.file === null && current.children.size === 1) {
    const [only] = [...current.children.values()]
    if (only.file !== null) break
    label = `${label}/${only.name}`
    current = only
  }
  return { label, node: current }
}

export function createCommitDetailsFunctions(
  _d: CommitDetailsDependencies
): CommitDetailsFunctions {
  const buildRows: CommitDetailsFunctions["buildRows"] = (files) => {
    const root = buildFileTree(files)
    const rows: Array<DetailRow> = []

    const walk = (node: FileNode, depth: number) => {
      const folders: Array<FileNode> = []
      const leaves: Array<FileNode> = []
      for (const child of node.children.values()) {
        ;(child.file !== null ? leaves : folders).push(child)
      }
      folders.sort((a, b) => a.name.localeCompare(b.name))
      leaves.sort((a, b) => a.name.localeCompare(b.name))

      for (const folder of folders) {
        const { label, node: deepest } = collapse(folder)
        rows.push({ kind: "folder", label, depth, count: countFiles(deepest) })
        walk(deepest, depth + 1)
      }
      for (const leaf of leaves) {
        rows.push({
          kind: "file",
          depth,
          name: leaf.name,
          file: leaf.file as CommitFileChange,
        })
      }
    }

    walk(root, 0)
    return rows
  }

  const statusLetter: CommitDetailsFunctions["statusLetter"] = (status) =>
    STATUS_LETTER[status] ?? "?"

  return { buildRows, statusLetter }
}
