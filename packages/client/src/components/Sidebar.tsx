import { FileTree, useFileTree } from "@pierre/trees/react"
import type { ReactNode } from "react"
import { useEffect, useRef } from "react"
import type { GitStatusEntry } from "../types"

interface SidebarProps {
  paths: ReadonlyArray<string>
  gitStatus: ReadonlyArray<GitStatusEntry>
  selectedFile: string | null
  onFileSelect: (path: string | null) => void
  footer?: ReactNode
}

export function Sidebar({ paths, gitStatus, selectedFile, onFileSelect, footer }: SidebarProps) {
  const onFileSelectRef = useRef(onFileSelect)
  onFileSelectRef.current = onFileSelect

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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Files</span>
        <span>{gitStatus.length > 0 ? `${gitStatus.length} changed` : ""}</span>
      </div>
      <div className="sidebar-tree">
        <FileTree model={model} style={{ height: "100%" }} />
      </div>
      {footer}
    </aside>
  )
}
