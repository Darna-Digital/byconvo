import type { ReactElement, ReactNode } from "react";
import type { AppMode } from "../types";

interface ModeRailProps {
  mode: AppMode;
  hasGitHub: boolean;
  theme: "light" | "dark";
  onModeChange: (mode: AppMode) => void;
  onThemeToggle: () => void;
}

interface ModeDef {
  readonly id: AppMode;
  readonly label: string;
  readonly icon: ReactElement;
}

const icon = (paths: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    {paths}
  </svg>
);

const COMMIT_ICON = icon(
  <>
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 3v5.8M12 15.2V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </>,
);

const REVIEW_ICON = icon(
  <>
    <circle cx="6.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="6.5" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="17.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M6.5 8.2v7.6M17.5 8.2v4.2a3 3 0 0 1-3 3H9"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </>,
);

const BROWSE_ICON = icon(
  <>
    <path
      d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l1.5 2h7A1.5 1.5 0 0 1 19.5 8.5v9A1.5 1.5 0 0 1 18 19H5.5A1.5 1.5 0 0 1 4 17.5z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </>,
);

export function ModeRail({
  mode,
  hasGitHub,
  theme,
  onModeChange,
  onThemeToggle,
}: ModeRailProps) {
  const modes: ReadonlyArray<ModeDef> = [
    { id: "commit", label: "Commit", icon: COMMIT_ICON },
    ...(hasGitHub
      ? [{ id: "review" as const, label: "Pull Requests", icon: REVIEW_ICON }]
      : []),
    { id: "browse", label: "Browse", icon: BROWSE_ICON },
  ];

  return (
    <nav className="mode-rail" aria-label="Mode">
      <div className="mode-rail-top">
        {modes.map((def) => (
          <button
            key={def.id}
            type="button"
            className={`rail-button ${mode === def.id ? "active" : ""}`}
            onClick={() => onModeChange(def.id)}
            title={def.label}
            aria-pressed={mode === def.id}
          >
            {def.icon}
            <span className="rail-label">{def.label}</span>
          </button>
        ))}
      </div>
      <div className="mode-rail-bottom">
        <button
          type="button"
          className="rail-button icon-only"
          onClick={onThemeToggle}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </nav>
  );
}
