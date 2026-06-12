import { langs } from "@uiw/codemirror-extensions-langs";
import type { LanguageName } from "@uiw/codemirror-extensions-langs";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";

interface CodeEditorProps {
  path: string;
  theme: "light" | "dark";
  onClose: () => void;
  /** Called after a successful save so the app can refresh diffs/status. */
  onSaved: () => void;
  onError: (message: string) => void;
}

// A handful of extensions whose CodeMirror language key differs from the ext.
const EXT_ALIAS: Record<string, LanguageName> = {
  yml: "yaml",
  htm: "html",
};

const languageForPath = (path: string): Extension | null => {
  const ext = path.split(".").at(-1)?.toLowerCase();
  if (ext === undefined) return null;
  const name = (EXT_ALIAS[ext] ?? ext) as LanguageName;
  const loader = langs[name];
  return typeof loader === "function" ? loader() : null;
};

export function CodeEditor({ path, theme, onClose, onSaved, onError }: CodeEditorProps) {
  const [value, setValue] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const valueRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    api
      .file(path)
      .then((file) => {
        if (cancelled) return;
        setValue(file.contents);
        setOriginal(file.contents);
        valueRef.current = file.contents;
      })
      .catch((cause: Error) => {
        if (!cancelled) onError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path, onError]);

  const extensions = useMemo(() => {
    const lang = languageForPath(path);
    return lang === null ? [] : [lang];
  }, [path]);

  const dirty = value !== null && value !== original;

  const save = useCallback(async () => {
    if (saving) return;
    const contents = valueRef.current;
    setSaving(true);
    try {
      await api.saveFile(path, contents);
      setOriginal(contents);
      onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [path, saving, onSaved, onError]);

  // Cmd/Ctrl+S saves from anywhere while the editor is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  return (
    <main className="editor-pane">
      <div className="editor-header">
        <span className="editor-path">
          {path}
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </span>
        <div className="editor-actions">
          <button
            type="button"
            className="editor-save"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="Close editor"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="editor-body">
        {value === null ? (
          <div className="diff-loading">Loading {path}…</div>
        ) : (
          <CodeMirror
            value={value}
            theme={theme === "dark" ? githubDark : githubLight}
            extensions={extensions}
            height="100%"
            style={{ height: "100%" }}
            onChange={(next) => {
              valueRef.current = next;
              setValue(next);
            }}
          />
        )}
      </div>
    </main>
  );
}
