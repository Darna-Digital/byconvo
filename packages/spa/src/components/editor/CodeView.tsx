import { File } from "@pierre/diffs/react"
import { IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useFile } from "@/lib/queries"
import type { Theme } from "@/lib/ui-prefs"

const THEMES = { light: "github-light", dark: "github-dark" } as const

interface CodeViewProps {
  path: string
  theme: Theme
  onEdit: (path: string) => void
  onClose: () => void
}

export function CodeView({ path, theme, onEdit, onClose }: CodeViewProps) {
  const file = useFile(path)

  if (file.isPending) {
    return <div className="p-8 text-sm text-muted-foreground">Loading {path}…</div>
  }
  if (file.error || file.data === undefined) {
    return <div className="p-8 text-sm text-destructive">Could not open {path}</div>
  }

  return (
    <div className="h-full overflow-auto">
      <section className="diff-file" data-file-anchor={path}>
        <File
          file={{ name: path, contents: file.data.contents }}
          disableWorkerPool
          options={{ theme: THEMES, themeType: theme, overflow: "wrap", stickyHeader: false }}
          renderHeaderMetadata={(meta) => (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="xs" onClick={() => onEdit(meta.name)}>
                Edit
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
                <IconX />
              </Button>
            </div>
          )}
        />
      </section>
    </div>
  )
}
