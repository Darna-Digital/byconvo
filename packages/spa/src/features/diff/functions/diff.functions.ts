import { diffTargetKey } from "@/lib/api/types"
import {
  fileTypeToStatus,
  type DiffDependencies,
  type DiffFunctions,
  type TreeInputs,
} from "../entity/diff.interfaces"

export function createDiffFunctions(d: DiffDependencies): DiffFunctions {
  const isInternalPath: DiffFunctions["isInternalPath"] = (path) =>
    path === d.data.internalDir || path.startsWith(`${d.data.internalDir}/`)

  const deriveTarget: DiffFunctions["deriveTarget"] = (selection) => {
    if (selection.mode === "commit") return { kind: "worktree" }
    if (selection.mode === "review") {
      return selection.selectedPull === null
        ? null
        : { kind: "pull", pull: selection.selectedPull }
    }
    if (selection.browse?.kind === "commit") {
      return { kind: "commit", sha: selection.browse.sha, shortSha: selection.browse.shortSha }
    }
    if (selection.browse?.kind === "range") {
      return { kind: "range", base: selection.browse.base, head: selection.browse.head }
    }
    return null
  }

  const parseFiles: DiffFunctions["parseFiles"] = (diffText) => {
    if (diffText === null || diffText.trim().length === 0) return []
    try {
      return d.sideEffects.parsePatch(diffText)
    } catch {
      return []
    }
  }

  const treePaths: DiffFunctions["treePaths"] = ({
    mode,
    allPaths,
    gitStatus,
    parsedFiles,
    commentedPaths = [],
  }: TreeInputs) => {
    if (mode === "browse") return allPaths.filter((path) => !isInternalPath(path))
    if (mode === "commit") {
      const commented = new Set(commentedPaths)
      return allPaths
        .filter((path) => !isInternalPath(path))
        .filter((path) => gitStatus.some((entry) => entry.path === path) || commented.has(path))
    }
    return parsedFiles.map((file) => file.name)
  }

  const treeGitStatus: DiffFunctions["treeGitStatus"] = ({ mode, gitStatus, parsedFiles }: TreeInputs) => {
    if (mode === "review") {
      return parsedFiles.map((file) => ({ path: file.name, status: fileTypeToStatus(file.type) }))
    }
    return gitStatus.filter((entry) => !isInternalPath(entry.path))
  }

  const changedFiles: DiffFunctions["changedFiles"] = (gitStatus) =>
    gitStatus.filter((entry) => !isInternalPath(entry.path))

  const visibleComments: DiffFunctions["visibleComments"] = ({
    targetKind,
    targetKey,
    localComments,
    pullComments,
  }) => {
    if (targetKind === "pull") return pullComments
    return localComments.filter((comment) => comment.target === targetKey)
  }

  return {
    deriveTarget,
    parseFiles,
    isInternalPath,
    treePaths,
    treeGitStatus,
    changedFiles,
    visibleComments,
  }
}

export { diffTargetKey }
