import { File } from "@pierre/diffs/react"
import { useEffect, useState } from "react"
import { api } from "../api"

interface CodeViewProps {
  path: string
  theme: "light" | "dark"
  /** Switch this file into the editable CodeMirror surface. */
  onEdit: (path: string) => void
  onClose: () => void
  onError: (message: string) => void
}

// Same theme mapping the diffs use so browsing and diffing render identically.
const THEMES = { light: "github-light", dark: "github-dark" } as const

export function CodeView({ path, theme, onEdit, onClose, onError }: CodeViewProps) {
  const [contents, setContents] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContents(null)
    api
      .file(path)
      .then((file) => {
        if (!cancelled) setContents(file.contents)
      })
      .catch((cause: Error) => {
        if (!cancelled) onError(cause.message)
      })
    return () => {
      cancelled = true
    }
  }, [path, onError])

  return (
    <main className="diff-pane">
      {contents === null ? (
        <div className="diff-loading">Loading {path}…</div>
      ) : (
        <section className="diff-file" data-file-anchor={path}>
          <File
            file={{ name: path, contents }}
            disableWorkerPool
            options={{
              theme: THEMES,
              themeType: theme,
              overflow: "wrap",
              stickyHeader: false,
            }}
            renderHeaderMetadata={(file) => (
              <div className="code-view-actions">
                <button
                  type="button"
                  className="edit-file-button"
                  onClick={() => onEdit(file.name)}
                  title={`Edit ${file.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={onClose}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            )}
          />
        </section>
      )}
    </main>
  )
}
