import type { RepoInfo, RepoStatus } from "../types";

/** Where the text caret sits in the open editor, 1-based. */
export interface CursorPosition {
  readonly line: number;
  readonly col: number;
}

interface StatusBarProps {
  repo: RepoInfo | null;
  status: RepoStatus | null;
  /** A background git operation (commit/push/pull/checkout) is running. */
  busy: boolean;
  /** The file currently open in the editor or read-only viewer, if any. */
  openPath: string | null;
  /** Caret position while a file is being edited (null in the read-only viewer). */
  cursor: CursorPosition | null;
  /** Open the repository picker — the branch widget is the click target. */
  onRepoClick: () => void;
}

// Map common file extensions to the language name JetBrains shows on the right
// of its status bar. Anything unlisted falls back to the bare extension.
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript JSX",
  js: "JavaScript",
  jsx: "JavaScript JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  htm: "HTML",
  md: "Markdown",
  mdx: "MDX",
  php: "PHP",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cs: "C#",
  swift: "Swift",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL",
  vue: "Vue",
  svelte: "Svelte",
};

const languageForPath = (path: string): string | null => {
  const ext = path.split(".").at(-1)?.toLowerCase();
  if (ext === undefined || ext === path.toLowerCase()) return null;
  return LANGUAGE_BY_EXT[ext] ?? ext.toUpperCase();
};

// A tiny git-branch glyph, matching the one used in the bottom branch list.
function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6v4M6 4.6c3 .8 4 1.6 4.4 1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function StatusBar({
  repo,
  status,
  busy,
  openPath,
  cursor,
  onRepoClick,
}: StatusBarProps) {
  const branch = status?.branch || repo?.currentBranch || null;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const changed = status?.changed ?? 0;
  const conflicted = status?.conflicted ?? 0;
  const language = openPath !== null ? languageForPath(openPath) : null;

  const changesTitle =
    status === null
      ? undefined
      : `${status.staged} staged · ${status.unstaged} unstaged · ${status.untracked} untracked` +
        (status.conflicted > 0 ? ` · ${status.conflicted} conflicted` : "");

  return (
    <footer className="status-bar">
      <div className="status-left">
        {branch !== null && (
          <button
            type="button"
            className="status-item status-branch"
            onClick={onRepoClick}
            title={
              status?.upstream
                ? `Tracking ${status.upstream}`
                : "Not tracking a remote branch"
            }
          >
            <BranchIcon />
            <span className="status-branch-name">{branch}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="status-track">
                {behind > 0 && <span title={`${behind} behind`}>↓{behind}</span>}
                {ahead > 0 && <span title={`${ahead} ahead`}>↑{ahead}</span>}
              </span>
            )}
          </button>
        )}

        {busy && (
          <span className="status-item status-busy" title="Working…">
            <span className="status-spinner" aria-hidden />
            Working…
          </span>
        )}

        {changed > 0 && (
          <span className="status-item" title={changesTitle}>
            {changed} changed
          </span>
        )}
        {conflicted > 0 && (
          <span className="status-item status-conflict" title={changesTitle}>
            {conflicted} conflicted
          </span>
        )}
      </div>

      <div className="status-right">
        {cursor !== null && (
          <span className="status-item status-cursor" title="Line:Column">
            {cursor.line}:{cursor.col}
          </span>
        )}
        {language !== null && <span className="status-item">{language}</span>}
        {openPath !== null && (
          <>
            <span className="status-item" title="File encoding">
              UTF-8
            </span>
            <span className="status-item" title="Line separator">
              LF
            </span>
          </>
        )}
        {status?.headSha && (
          <span className="status-item status-sha" title="HEAD commit">
            {status.headSha}
          </span>
        )}
      </div>
    </footer>
  );
}
