import { langs, type LanguageName } from "@uiw/codemirror-extensions-langs"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { EditorState } from "@codemirror/state"
import CodeMirror, {
  EditorView,
  Prec,
  type Extension,
} from "@uiw/react-codemirror"
import { IconPencil, IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { useConflictsFunctions } from "@/features/conflicts/adapters/conflicts.hook.adapter"
import { mergeConflictExtension } from "@/components/git/mergeConflictExtension"
import { useFile } from "@/lib/queries"
import { cn } from "@/lib/utils"
import type { Theme } from "@/lib/ui-prefs"

interface ConflictViewProps {
  path: string
  theme: Theme
  /** Take one whole side for the entire file (server-side checkout). */
  onUseSide: (side: "ours" | "theirs") => void
  /** Persist the user-merged content and stage it as resolved. */
  onResolve: (mergedContent: string) => void
  /** Open the file in the full editor for freeform fixes. */
  onEdit: (path: string) => void
  onClose: () => void
}

const MONO =
  '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'

// Match the plain-editor surface (see CodeEditor.tsx) so the merge columns read
// like the rest of the app rather than the bundled github theme's own canvas.
const surface = (theme: Theme): Extension =>
  Prec.highest(
    EditorView.theme(
      {
        "&": { backgroundColor: "var(--background)", height: "100%" },
        ".cm-content": { fontFamily: MONO },
        ".cm-scroller": {
          fontFamily: MONO,
          fontSize: "13px",
          lineHeight: "20px",
        },
        ".cm-gutters": { backgroundColor: "var(--background)", border: "none" },
      },
      { dark: theme === "dark" }
    )
  )

const EXT_ALIAS: Record<string, LanguageName> = { yml: "yaml", htm: "html" }

const languageExt = (path: string): Extension | null => {
  const ext = path.split(".").at(-1)?.toLowerCase()
  if (ext === undefined) return null
  const name = EXT_ALIAS[ext] ?? (ext as LanguageName)
  const loader = langs[name]
  return typeof loader === "function" ? loader() : null
}

/**
 * JetBrains-style three-pane merge editor: read-only Ours and Theirs on the
 * sides, an editable Result in the middle. The Result is seeded with the
 * conflicted file (markers and all); each conflict carries an inline accept
 * toolbar (see `mergeConflictExtension`) and the whole buffer stays freely
 * editable. "Mark resolved" writes the Result once no markers remain.
 */
export function ConflictView({
  path,
  theme,
  onUseSide,
  onResolve,
  onEdit,
  onClose,
}: ConflictViewProps) {
  const file = useFile(path)
  const conflicts = useConflictsFunctions()
  const [result, setResult] = useState<string | null>(null)

  const original = file.data?.contents ?? null

  // Seed (and re-seed on file change) the editable Result with the conflicted
  // file. Re-keyed by path so switching files resets cleanly.
  useEffect(() => {
    setResult(original)
  }, [original])

  const sides = useMemo(() => {
    if (original === null) return { ours: "", theirs: "" }
    const regions = conflicts.parse(original)
    return {
      ours: conflicts.reconstruct(regions, "ours"),
      theirs: conflicts.reconstruct(regions, "theirs"),
    }
  }, [original, conflicts])

  const remaining = useMemo(
    () =>
      result === null ? 0 : conflicts.conflicts(conflicts.parse(result)).length,
    [result, conflicts]
  )

  const lang = useMemo(() => languageExt(path), [path])
  const themeExt = theme === "dark" ? githubDark : githubLight
  const readOnlyExtensions = useMemo<Array<Extension>>(() => {
    const base = [themeExt, surface(theme), EditorState.readOnly.of(true)]
    return lang === null ? base : [lang, ...base]
  }, [lang, themeExt, theme])
  const editorExtensions = useMemo<Array<Extension>>(() => {
    const base = [themeExt, surface(theme), mergeConflictExtension]
    return lang === null ? base : [lang, ...base]
  }, [lang, themeExt, theme])

  if (file.isPending || result === null) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading {path}…</div>
    )
  }
  if (file.error) {
    return (
      <div className="p-8 text-sm text-destructive">Could not open {path}</div>
    )
  }

  const resolved = remaining === 0

  return (
    <div className="flex h-full flex-col">
      {/* Resolver toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="truncate font-mono text-xs">{path}</span>
        <span className="text-xs text-muted-foreground">
          {resolved
            ? "all conflicts resolved"
            : `${remaining} conflict${remaining === 1 ? "" : "s"} left`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="xs" variant="outline" onClick={() => onUseSide("ours")}>
            Use ours
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onUseSide("theirs")}
          >
            Use theirs
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            onClick={() => onEdit(path)}
          >
            <IconPencil className="size-3" />
            Edit
          </Button>
          <Button
            size="xs"
            disabled={!resolved}
            onClick={() => onResolve(result)}
          >
            Mark resolved
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <IconX />
          </Button>
        </div>
      </div>

      {/* Three panes: Ours | Result (editable) | Theirs */}
      <div className="flex min-h-0 flex-1">
        <Pane label="Ours (current)" tone="ours">
          <CodeMirror
            value={sides.ours}
            theme="none"
            editable={false}
            extensions={readOnlyExtensions}
            height="100%"
            style={{ height: "100%" }}
          />
        </Pane>
        <Pane label="Result (editable)" tone="result">
          <CodeMirror
            value={result}
            theme="none"
            extensions={editorExtensions}
            height="100%"
            style={{ height: "100%" }}
            onChange={setResult}
          />
        </Pane>
        <Pane label="Theirs (incoming)" tone="theirs" last>
          <CodeMirror
            value={sides.theirs}
            theme="none"
            editable={false}
            extensions={readOnlyExtensions}
            height="100%"
            style={{ height: "100%" }}
          />
        </Pane>
      </div>
    </div>
  )
}

const TONES = {
  ours: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  result: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  theirs: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
} as const

function Pane({
  label,
  tone,
  last = false,
  children,
}: {
  label: string
  tone: keyof typeof TONES
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", !last && "border-r")}>
      <div
        className={cn(
          "shrink-0 border-b px-3 py-1 text-xs font-medium",
          TONES[tone]
        )}
      >
        {label}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
