import { FileTree, useFileTree } from "@pierre/trees/react"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import type { AppMode, GitStatusEntry } from "../types"

interface SidebarProps {
  mode: AppMode
  paths: ReadonlyArray<string>
  gitStatus: ReadonlyArray<GitStatusEntry>
  selectedFile: string | null
  onFileSelect: (path: string | null) => void
  /** Delete a file or folder on disk. When omitted, the menu hides Delete. */
  onDeletePath?: (path: string, isDirectory: boolean) => Promise<void>
  /** Rename/move a path on disk. When omitted, inline rename is disabled. */
  onRenamePath?: (from: string, to: string) => Promise<void>
  onError?: (message: string) => void
  footer?: ReactNode
}

const HEADER_TITLE: Record<AppMode, string> = {
  commit: "Changed files",
  review: "Files in this PR",
  browse: "Project",
}

export function Sidebar({
  mode,
  paths,
  gitStatus,
  selectedFile,
  onFileSelect,
  onDeletePath,
  onRenamePath,
  onError,
  footer
}: SidebarProps) {
  const onFileSelectRef = useRef(onFileSelect)
  onFileSelectRef.current = onFileSelect

  // The tree model is created once, so live props are read through refs.
  const onRenamePathRef = useRef(onRenamePath)
  onRenamePathRef.current = onRenamePath
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const pathsRef = useRef(paths)
  pathsRef.current = paths

  const { model } = useFileTree({
    paths: [...paths],
    initialExpansion: "open",
    flattenEmptyDirectories: true,
    search: true,
    gitStatus: [...gitStatus],
    onSelectionChange: (selectedPaths) => {
      const first = selectedPaths.at(0)
      if (first !== undefined) {
        const item = modelRef.current?.getItem(first)
        if (item != null && !item.isDirectory()) {
          onFileSelectRef.current(first)
        }
      }
    },
    renaming: {
      canRename: () => onRenamePathRef.current !== undefined,
      onError: (message) => onErrorRef.current?.(message),
      onRename: ({ destinationPath, sourcePath }) => {
        // Restore the tree from the source of truth if the disk op fails;
        // the library has already moved the row optimistically.
        const revert = () => modelRef.current?.resetPaths([...pathsRef.current])
        const handler = onRenamePathRef.current
        if (handler === undefined) return revert()
        if (destinationPath === sourcePath) return
        void handler(sourcePath, destinationPath).catch(revert)
      }
    }
  })

  const modelRef = useRef(model)
  modelRef.current = model

  // Keep the tree in sync when the file list or git status changes.
  const pathsKey = paths.join("\n")
  useEffect(() => {
    model.resetPaths([...paths])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey, model])

  const statusKey = gitStatus.map((entry) => `${entry.path}:${entry.status}`).join("\n")
  useEffect(() => {
    model.setGitStatus([...gitStatus])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, pathsKey, model])

  useEffect(() => {
    if (selectedFile !== null) {
      model.scrollToPath(selectedFile, { focus: false })
    }
  }, [selectedFile, model])

  // A context menu is offered only when at least one operation is available.
  const hasMenu = onDeletePath !== undefined || onRenamePath !== undefined
  const renderContextMenu = hasMenu
    ? (item: { kind: "directory" | "file"; path: string }, context: { close: (options?: { restoreFocus?: boolean }) => void }) => (
      <div className="tree-context-menu" role="menu">
        {onRenamePath !== undefined && (
          <button
            type="button"
            role="menuitem"
            className="tree-context-menu-item"
            onClick={() => {
              // Hand focus straight to the inline rename input.
              context.close({ restoreFocus: false })
              modelRef.current?.startRenaming(item.path)
            }}
          >
            Rename…
          </button>
        )}
        {onDeletePath !== undefined && (
          <button
            type="button"
            role="menuitem"
            className="tree-context-menu-item tree-context-menu-danger"
            onClick={() => {
              context.close()
              void onDeletePath(item.path, item.kind === "directory")
            }}
          >
            Delete
          </button>
        )}
      </div>
    )
    : undefined

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>{HEADER_TITLE[mode]}</span>
        <span>
          {mode !== "browse" && gitStatus.length > 0
            ? `${gitStatus.length} ${mode === "review" ? "files" : "changed"}`
            : ""}
        </span>
      </div>
      <div className="sidebar-tree">
        <FileTree model={model} renderContextMenu={renderContextMenu} style={{ height: "100%" }} />
      </div>
      {footer}
    </aside>
  )
}
