import { getFiletypeFromFileName, getHighlighterOptions, preloadHighlighter } from "@pierre/diffs"
import { File } from "@pierre/diffs/react"
import { IconX } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useFile } from "@/lib/queries"
import type { Theme } from "@/lib/ui-prefs"

const THEMES = { light: "github-light", dark: "github-dark" } as const

// Languages whose Shiki grammar has finished loading into the shared
// highlighter. The highlighter only reliably highlights a file when its
// language is already attached at mount time, so we preload per language and
// remember what's ready to avoid re-gating on repeat visits.
const readyLangs = new Set<string>()

interface CodeViewProps {
  path: string
  theme: Theme
  onEdit: (path: string) => void
  onClose: () => void
}

export function CodeView({ path, theme, onEdit, onClose }: CodeViewProps) {
  const file = useFile(path)
  const lang = getFiletypeFromFileName(path)
  const [langReady, setLangReady] = useState(() => readyLangs.has(lang))

  // Ensure the file's language grammar is attached before mounting `File`;
  // otherwise it renders unhighlighted and won't re-highlight in place when the
  // grammar later loads (it only highlights cleanly on a fresh mount).
  useEffect(() => {
    if (readyLangs.has(lang)) {
      setLangReady(true)
      return
    }
    setLangReady(false)
    let cancelled = false
    const done = () => {
      readyLangs.add(lang)
      if (!cancelled) setLangReady(true)
    }
    void preloadHighlighter(getHighlighterOptions(lang, { theme: THEMES })).then(done, done)
    return () => {
      cancelled = true
    }
  }, [lang])

  if (file.isPending || !langReady) {
    return <div className="p-8 text-sm text-muted-foreground">Loading {path}…</div>
  }
  if (file.error || file.data === undefined) {
    return <div className="p-8 text-sm text-destructive">Could not open {path}</div>
  }

  return (
    <div className="h-full overflow-auto">
      <section className="diff-file" data-file-anchor={path}>
        {/* Remount per file: the underlying File instance doesn't re-highlight
            when only its `file` prop changes, so navigating between files would
            otherwise show the new contents unhighlighted until a reload. */}
        <File
          key={path}
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
