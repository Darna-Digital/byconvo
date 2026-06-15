import { langs } from "@uiw/codemirror-extensions-langs"
import type { LanguageName } from "@uiw/codemirror-extensions-langs"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView, Prec } from "@uiw/react-codemirror"
import type { Extension, ViewUpdate } from "@uiw/react-codemirror"
import { IconX } from "@tabler/icons-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { fetchClient } from "@/lib/api/client"
import { useFile } from "@/lib/queries"
import type { Theme } from "@/lib/ui-prefs"

export interface CursorPosition {
  line: number
  col: number
}

const MONO =
  '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'

const SURFACE = {
  light: {
    bg: "var(--background)",
    fg: "#24292e",
    gutter: "#afb8c1",
    active: "rgba(0,0,0,0.03)",
  },
  dark: {
    bg: "var(--background)",
    fg: "#e1e4e8",
    gutter: "#545d68",
    active: "rgba(255,255,255,0.04)",
  },
} as const

// Wrapped in Prec.highest so our background wins over the github theme's own
// `&` rule (equal specificity — without this the base theme's #0d1117 leaks
// through on the editor root while only the gutters pick up var(--background)).
const pierreSurface = (theme: Theme): Extension =>
  Prec.highest(
    EditorView.theme(
      {
        "&": {
          backgroundColor: SURFACE[theme].bg,
          color: SURFACE[theme].fg,
          height: "100%",
        },
        ".cm-content": { caretColor: SURFACE[theme].fg, fontFamily: MONO },
        ".cm-scroller": {
          fontFamily: MONO,
          fontSize: "13px",
          lineHeight: "20px",
        },
        ".cm-gutters": {
          backgroundColor: SURFACE[theme].bg,
          color: SURFACE[theme].gutter,
          border: "none",
        },
        ".cm-activeLine": { backgroundColor: SURFACE[theme].active },
        ".cm-activeLineGutter": {
          backgroundColor: SURFACE[theme].active,
          color: SURFACE[theme].fg,
        },
      },
      { dark: theme === "dark" }
    )
  )

const EXT_ALIAS: Record<string, LanguageName> = { yml: "yaml", htm: "html" }

const languageForPath = (path: string): Extension | null => {
  const ext = path.split(".").at(-1)?.toLowerCase()
  if (ext === undefined) return null
  const name = EXT_ALIAS[ext] ?? ext
  const loader = langs[name]
  return typeof loader === "function" ? loader() : null
}

interface CodeEditorProps {
  path: string
  theme: Theme
  onClose: () => void
  onSaved: () => void
  onCursor?: (pos: CursorPosition | null) => void
}

export function CodeEditor({
  path,
  theme,
  onClose,
  onSaved,
  onCursor,
}: CodeEditorProps) {
  const loaded = useFile(path)
  const [value, setValue] = useState<string | null>(null)
  const [original, setOriginal] = useState("")
  const [saving, setSaving] = useState(false)
  const valueRef = useRef("")

  useEffect(() => {
    if (loaded.data !== undefined) {
      setValue(loaded.data.contents)
      setOriginal(loaded.data.contents)
      valueRef.current = loaded.data.contents
    }
  }, [loaded.data])

  const extensions = useMemo(() => {
    const lang = languageForPath(path)
    const base = [
      theme === "dark" ? githubDark : githubLight,
      pierreSurface(theme),
    ]
    return lang === null ? base : [lang, ...base]
  }, [path, theme])

  const dirty = value !== null && value !== original

  const reportCursor = useCallback(
    (update: ViewUpdate) => {
      if (onCursor === undefined) return
      if (!update.selectionSet && !update.docChanged && !update.focusChanged)
        return
      const head = update.state.selection.main.head
      const line = update.state.doc.lineAt(head)
      onCursor({ line: line.number, col: head - line.from + 1 })
    },
    [onCursor]
  )

  useEffect(() => () => onCursor?.(null), [onCursor])

  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const { error } = await fetchClient.PUT("/api/file", {
        body: { path, contents: valueRef.current },
      })
      if (error)
        throw new Error((error as { reason?: string }).reason ?? "save failed")
      setOriginal(valueRef.current)
      toast.success("Saved")
      onSaved()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }, [path, saving, onSaved])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [save])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <span className="flex items-center gap-2 font-mono text-xs">
          {path}
          {dirty && (
            <span
              className="size-1.5 rounded-full bg-primary"
              title="Unsaved changes"
            />
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close editor"
          >
            <IconX />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {value === null ? (
          <div className="p-8 text-sm text-muted-foreground">
            Loading {path}…
          </div>
        ) : (
          <CodeMirror
            value={value}
            theme="none"
            extensions={extensions}
            height="100%"
            style={{ height: "100%" }}
            onChange={(next) => {
              valueRef.current = next
              setValue(next)
            }}
            onUpdate={reportCursor}
          />
        )}
      </div>
    </div>
  )
}
