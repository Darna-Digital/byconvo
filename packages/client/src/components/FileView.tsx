import { File } from "@pierre/diffs/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { FileContent } from "../types";

interface FileViewProps {
  path: string;
  theme: "light" | "dark";
}

const THEMES = { light: "github-light", dark: "github-dark" } as const;

export function FileView({ path, theme }: FileViewProps) {
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    api
      .file(path)
      .then((loaded) => {
        if (!cancelled) setFile(loaded);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error !== null) {
    return (
      <main className="diff-pane">
        <div className="diff-error">{error}</div>
      </main>
    );
  }

  if (file === null) {
    return (
      <main className="diff-pane">
        <div className="diff-loading">Loading {path}…</div>
      </main>
    );
  }

  return (
    <main className="diff-pane">
      <section className="diff-file">
        <File
          file={{ name: path, contents: file.contents }}
          disableWorkerPool
          options={{
            theme: THEMES,
            themeType: theme,
            overflow: "scroll",
            stickyHeader: false,
          }}
        />
      </section>
    </main>
  );
}
