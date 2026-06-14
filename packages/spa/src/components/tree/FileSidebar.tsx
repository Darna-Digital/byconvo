import { FileTree, useFileTree } from "@pierre/trees/react"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import type { AppMode, GitStatusEntry } from "@/lib/api/types"

interface FileSidebarProps {
  mode: AppMode
  paths: ReadonlyArray<string>
  gitStatus: ReadonlyArray<GitStatusEntry>
  selectedFile: string | null
  onFileSelect: (path: string | null) => void
  onDeletePath?: (path: string, isDirectory: boolean) => Promise<void> | void
  onRenamePath?: (from: string, to: string) => Promise<void>
  onError?: (message: string) => void
  footer?: ReactNode
}

const HEADER_TITLE: Record<AppMode, string> = {
  commit: "Changed files",
  review: "Files in this PR",
  browse: "Project",
}

export function FileSidebar({
  mode,
  paths,
  gitStatus,
  selectedFile,
  onFileSelect,
  onDeletePath,
  onRenamePath,
  onError,
  footer,
}: FileSidebarProps) {
  const onFileSelectRef = useRef(onFileSelect)
  onFileSelectRef.current = onFileSelect
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
        if (item != null && !item.isDirectory()) onFileSelectRef.current(first)
      }
    },
    renaming: {
      canRename: () => onRenamePathRef.current !== undefined,
      onError: (message) => onErrorRef.current?.(message),
      onRename: ({ destinationPath, sourcePath }) => {
        const revert = () => modelRef.current?.resetPaths([...pathsRef.current])
        const handler = onRenamePathRef.current
        if (handler === undefined) return revert()
        if (destinationPath === sourcePath) return
        void handler(sourcePath, destinationPath).catch(revert)
      },
    },
  })

  const modelRef = useRef(model)
  modelRef.current = model

  const pathsKey = paths.join("\n")
  useEffect(() => {
    model.resetPaths([...paths])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey, model])

  const statusKey = gitStatus.map((e) => `${e.path}:${e.status}`).join("\n")
  useEffect(() => {
    model.setGitStatus([...gitStatus])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, pathsKey, model])

  useEffect(() => {
    if (selectedFile !== null) model.scrollToPath(selectedFile, { focus: false })
  }, [selectedFile, model])

  const hasMenu = onDeletePath !== undefined || onRenamePath !== undefined
  const renderContextMenu = hasMenu
    ? (
        item: { kind: "directory" | "file"; path: string },
        context: { close: (options?: { restoreFocus?: boolean }) => void },
      ) => (
        <div
          role="menu"
          className="min-w-36 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {onRenamePath !== undefined && (
            <button
              role="menuitem"
              className="flex w-full items-center rounded-sm px-2 py-1 text-left hover:bg-muted"
              onClick={() => {
                context.close({ restoreFocus: false })
                modelRef.current?.startRenaming(item.path)
              }}
            >
              Rename…
            </button>
          )}
          {onDeletePath !== undefined && (
            <button
              role="menuitem"
              className="flex w-full items-center rounded-sm px-2 py-1 text-left text-destructive hover:bg-muted"
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
    <aside className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-xs text-muted-foreground">
        <span className="font-medium">{HEADER_TITLE[mode]}</span>
        {mode !== "browse" && gitStatus.length > 0 && (
          <span>
            {gitStatus.length} {mode === "review" ? "files" : "changed"}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FileTree model={model} renderContextMenu={renderContextMenu} style={{ height: "100%" }} />
      </div>
      {footer}
    </aside>
  )
}
