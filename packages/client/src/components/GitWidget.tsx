import { useEffect, useMemo, useRef, useState } from "react";
import type { AppMode, BranchInfo, RemoteBranchInfo, RepoInfo } from "../types";

interface GitWidgetProps {
  repo: RepoInfo;
  branches: ReadonlyArray<BranchInfo>;
  remoteBranches: ReadonlyArray<RemoteBranchInfo>;
  mode: AppMode;
  /** Label for the active pull request, e.g. "#90", shown in review mode. */
  prLabel: string | null;
  opBusy: boolean;
  onCheckout: (ref: string) => void;
  onCheckoutAndUpdate: (ref: string) => void;
  onCreateBranch: (name: string, startPoint: string | null) => void;
  onCompare: (base: string, head: string) => void;
  onMerge: (branch: string) => void;
  onRebase: (onto: string) => void;
  onFetch: () => void;
  onRenameBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  onCommitMode: () => void;
  onReviewMode: () => void;
  onPush: () => void;
  onPull: () => void;
  /** In-app prompt; `window.prompt` is a no-op under the Electron shell. */
  prompt: (message: string, options?: { defaultValue?: string }) => Promise<string | null>;
}

const GitHubMark = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

const BranchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="12" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 6v4M4 10c0-3 .5-4 4-4" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const StarIcon = () => (
  <svg className="star" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 1.3l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11l-3.8 2 .7-4.2-3.1-3 4.3-.6L8 1.3Z" />
  </svg>
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className={`chev${open ? " open" : ""}`}
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
  >
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

interface ActionItem {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly run: () => void;
}

/** A branch the second-level menu acts on, normalised across local and remote. */
interface BranchTarget {
  /** Full display name, e.g. "task/BMB-207" or "origin/feature". */
  readonly display: string;
  /** The ref to check out — a local name, or a remote's short name (tracking). */
  readonly ref: string;
  readonly isCurrent: boolean;
  readonly isRemote: boolean;
}

interface SubmenuState {
  readonly target: BranchTarget;
  readonly top: number;
  readonly left: number;
}

/** Split a branch name into a folder prefix and leaf, e.g. "task/BMB-1" → ["task", "BMB-1"]. */
const splitFolder = (name: string): [string | null, string] => {
  const slash = name.indexOf("/");
  if (slash < 0) return [null, name];
  return [name.slice(0, slash), name.slice(slash + 1)];
};

interface FolderGroup<T> {
  readonly folder: string | null;
  readonly items: ReadonlyArray<T>;
}

/** Group branch-like rows by their first path segment, preserving order. */
const groupByFolder = <T,>(
  rows: ReadonlyArray<T>,
  nameOf: (row: T) => string,
): ReadonlyArray<FolderGroup<T>> => {
  const groups: Array<{ folder: string | null; items: Array<T> }> = [];
  const index = new Map<string | null, number>();
  for (const row of rows) {
    const [folder] = splitFolder(nameOf(row));
    let at = index.get(folder);
    if (at === undefined) {
      at = groups.length;
      index.set(folder, at);
      groups.push({ folder, items: [] });
    }
    groups[at]!.items.push(row);
  }
  return groups;
};

const SUBMENU_WIDTH = 320;

export function GitWidget({
  repo,
  branches,
  remoteBranches,
  mode,
  prLabel,
  opBusy,
  onCheckout,
  onCheckoutAndUpdate,
  onCreateBranch,
  onCompare,
  onMerge,
  onRebase,
  onFetch,
  onRenameBranch,
  onDeleteBranch,
  onCommitMode,
  onReviewMode,
  onPush,
  onPull,
  prompt,
}: GitWidgetProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Sections collapse independently; Recent + Local open by default like JetBrains.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    recent: false,
    local: false,
    remote: true,
  });
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = branches.find((branch) => branch.isCurrent);
  const currentName = current?.name ?? repo.currentBranch;

  // Close on outside click or Escape; focus the search box on open.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (submenu !== null) setSubmenu(null);
        else setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    searchRef.current?.focus();
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, submenu]);

  const close = () => {
    setOpen(false);
    setSubmenu(null);
    setQuery("");
  };

  const hasGitHub = repo.github != null;

  const actions = useMemo<ReadonlyArray<ActionItem>>(() => {
    const items: Array<ActionItem> = [
      {
        id: "update",
        label: "Update Project…",
        shortcut: "⌘T",
        run: () => {
          onPull();
          close();
        },
      },
      {
        id: "commit",
        label: "Commit…",
        shortcut: "⌘K",
        checked: mode === "commit",
        run: () => {
          onCommitMode();
          close();
        },
      },
      {
        id: "push",
        label: "Push…",
        shortcut: "⇧⌘K",
        run: () => {
          onPush();
          close();
        },
      },
    ];
    if (hasGitHub) {
      items.push({
        id: "review",
        label: "Review Mode",
        checked: mode === "review",
        run: () => {
          onReviewMode();
          close();
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasGitHub]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => q.length === 0 || text.toLowerCase().includes(q);
  // When searching, expand every section so hits are never hidden.
  const isCollapsed = (id: string) => q.length === 0 && collapsed[id] === true;

  const filteredActions = actions.filter((action) => matches(action.label));

  const recent = useMemo(
    () => branches.filter((branch) => matches(branch.name)).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, q],
  );
  const localGroups = useMemo(
    () => groupByFolder(branches.filter((branch) => matches(branch.name)), (b) => b.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, q],
  );
  const remoteGroups = useMemo(
    () =>
      groupByFolder(
        remoteBranches.filter((branch) => matches(branch.name)),
        (b) => b.name,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteBranches, q],
  );

  // Anchor the second-level menu to the clicked row, flipping to the left and
  // shifting up when it would spill past the viewport edges.
  const openSubmenu = (target: BranchTarget, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    let left = rect.right + 4;
    if (left + SUBMENU_WIDTH > window.innerWidth) {
      left = Math.max(8, rect.left - SUBMENU_WIDTH - 4);
    }
    const top = Math.min(rect.top, Math.max(8, window.innerHeight - 380));
    setSubmenu({ target, top, left });
  };

  const newBranch = () => {
    void prompt("New branch name:").then((name) => {
      if (name === null || name.trim().length === 0) return;
      onCreateBranch(name.trim(), null);
      close();
    });
  };

  const checkoutRevision = () => {
    void prompt("Checkout branch, tag, or revision:").then((ref) => {
      if (ref === null || ref.trim().length === 0) return;
      onCheckout(ref.trim());
      close();
    });
  };

  const triggerLabel =
    prLabel !== null && mode === "review"
      ? `${prLabel} on ${currentName}`
      : currentName;

  const toggleSection = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const localCount = localGroups.reduce((sum, group) => sum + group.items.length, 0);
  const remoteCount = remoteGroups.reduce((sum, group) => sum + group.items.length, 0);
  const showNew = matches("New Branch");
  const showRevision = matches("Checkout Tag or Revision");

  // The JetBrains-style action list for the focused branch.
  const submenuActions = (target: BranchTarget): ReadonlyArray<ActionItem> => {
    const run = (fn: () => void): (() => void) => () => {
      fn();
      close();
    };
    const items: Array<ActionItem & { sep?: boolean }> = [];
    if (!target.isCurrent) {
      items.push({ id: "checkout", label: "Checkout", run: run(() => onCheckout(target.ref)) });
    }
    items.push({
      id: "new-from",
      label: `New Branch from '${target.display}'…`,
      run: () => {
        void prompt(`New branch from '${target.display}':`).then((name) => {
          if (name === null || name.trim().length === 0) return;
          onCreateBranch(name.trim(), target.ref);
          close();
        });
      },
    });
    if (!target.isCurrent) {
      items.push({
        id: "checkout-update",
        label: "Checkout and Update",
        run: run(() => onCheckoutAndUpdate(target.ref)),
      });
      items.push({
        id: "compare",
        label: `Compare with '${currentName}'`,
        run: run(() => onCompare(currentName, target.ref)),
      });
      items.push({
        id: "merge",
        label: `Merge '${target.display}' into '${currentName}'`,
        run: run(() => onMerge(target.ref)),
      });
      items.push({
        id: "rebase",
        label: `Rebase '${currentName}' onto '${target.display}'`,
        run: run(() => onRebase(target.ref)),
      });
    }
    items.push({ id: "update", label: "Update", run: run(onFetch) });
    items.push({ id: "push", label: "Push…", run: run(onPush) });
    if (!target.isRemote) {
      items.push({
        id: "rename",
        label: "Rename…",
        shortcut: "F2",
        run: run(() => onRenameBranch(target.ref)),
      });
      if (!target.isCurrent) {
        items.push({ id: "delete", label: "Delete", run: run(() => onDeleteBranch(target.ref)) });
      }
    }
    return items;
  };

  return (
    <div className="git-widget" ref={rootRef}>
      <button
        type="button"
        className={`git-trigger${open ? " open" : ""}`}
        onClick={() => (open ? close() : setOpen(true))}
        title="Git branches and actions"
      >
        <span className="git-trigger-icon">
          {hasGitHub ? <GitHubMark /> : <BranchIcon />}
        </span>
        <span className="git-trigger-label">{triggerLabel}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="git-menu" role="menu">
          <div className="git-menu-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search for branches and actions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="git-menu-tool"
              title="Collapse all"
              onClick={() =>
                setCollapsed({ recent: true, local: true, remote: true })
              }
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="git-menu-scroll">
            {filteredActions.length > 0 && (
              <div className="git-menu-group">
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="git-menu-action"
                    onClick={action.run}
                    disabled={opBusy && (action.id === "push" || action.id === "update")}
                  >
                    <span className="check">{action.checked ? "✓" : ""}</span>
                    <span className="label">{action.label}</span>
                    {action.shortcut !== undefined && (
                      <span className="shortcut">{action.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {(showNew || showRevision) && (
              <>
                <div className="git-menu-sep" />
                <div className="git-menu-group">
                  {showNew && (
                    <button type="button" className="git-menu-action" onClick={newBranch}>
                      <span className="check" />
                      <span className="label">New Branch…</span>
                      <span className="shortcut">⌥⌘N</span>
                    </button>
                  )}
                  {showRevision && (
                    <button
                      type="button"
                      className="git-menu-action"
                      onClick={checkoutRevision}
                    >
                      <span className="check" />
                      <span className="label">Checkout Tag or Revision…</span>
                    </button>
                  )}
                </div>
              </>
            )}

            <Section
              id="recent"
              title="Recent"
              count={recent.length}
              collapsed={isCollapsed("recent")}
              onToggle={() => toggleSection("recent")}
            >
              {recent.map((branch) => (
                <LocalRow
                  key={`r-${branch.name}`}
                  branch={branch}
                  active={submenu?.target.ref === branch.name}
                  onOpen={openSubmenu}
                  flat
                />
              ))}
            </Section>

            <Section
              id="local"
              title="Local"
              count={localCount}
              collapsed={isCollapsed("local")}
              onToggle={() => toggleSection("local")}
            >
              {localGroups.map((group) => (
                <BranchFolder
                  key={`l-${group.folder ?? "_"}`}
                  folder={group.folder}
                  defaultOpen={q.length > 0}
                >
                  {group.items.map((branch) => (
                    <LocalRow
                      key={branch.name}
                      branch={branch}
                      active={submenu?.target.ref === branch.name}
                      onOpen={openSubmenu}
                      nested={group.folder !== null}
                    />
                  ))}
                </BranchFolder>
              ))}
            </Section>

            <Section
              id="remote"
              title="Remote"
              count={remoteCount}
              collapsed={isCollapsed("remote")}
              onToggle={() => toggleSection("remote")}
            >
              {remoteGroups.map((group) => (
                <BranchFolder
                  key={`rm-${group.folder ?? "_"}`}
                  folder={group.folder}
                  defaultOpen={q.length > 0}
                >
                  {group.items.map((branch) => (
                    <button
                      key={branch.name}
                      type="button"
                      className={`git-branch-row nested${
                        submenu?.target.display === branch.name ? " active" : ""
                      }`}
                      title={branch.subject}
                      onClick={(event) =>
                        openSubmenu(
                          {
                            display: branch.name,
                            ref: branch.shortName,
                            isCurrent: false,
                            isRemote: true,
                          },
                          event,
                        )
                      }
                    >
                      <span className="git-branch-icon">
                        <BranchIcon />
                      </span>
                      <span className="name">{splitFolder(branch.name)[1]}</span>
                      <span className="upstream">{branch.remote}</span>
                      <Chevron open={false} />
                    </button>
                  ))}
                </BranchFolder>
              ))}
            </Section>
          </div>
        </div>
      )}

      {open && submenu !== null && (
        <div
          className="git-submenu"
          role="menu"
          style={{ top: submenu.top, left: submenu.left, width: SUBMENU_WIDTH }}
        >
          {submenuActions(submenu.target).map((action, index, all) => {
            // Group separators the way JetBrains does: after checkout actions,
            // after the merge/rebase block, and before rename/delete.
            const prev = all[index - 1];
            const sep =
              prev !== undefined &&
              ((action.id === "update" && prev.id !== "update") ||
                (action.id === "rename") ||
                (action.id === "compare"));
            return (
              <div key={action.id}>
                {sep && <div className="git-menu-sep" />}
                <button
                  type="button"
                  className="git-menu-action"
                  onClick={action.run}
                  disabled={opBusy}
                >
                  <span className="label">{action.label}</span>
                  {action.shortcut !== undefined && (
                    <span className="shortcut">{action.shortcut}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="git-section" data-section={id}>
      <button type="button" className="git-section-head" onClick={onToggle}>
        <Chevron open={!collapsed} />
        <span className="title">{title}</span>
      </button>
      {!collapsed && <div className="git-section-body">{children}</div>}
    </div>
  );
}

function BranchFolder({
  folder,
  defaultOpen,
  children,
}: {
  folder: string | null;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (folder === null) return <>{children}</>;
  return (
    <div className="git-folder">
      <button type="button" className="git-folder-head" onClick={() => setOpen((v) => !v)}>
        <Chevron open={open} />
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M2 4.5C2 3.7 2.7 3 3.5 3h2.7l1.3 1.4h5C13.3 4.4 14 5 14 5.9V11c0 .8-.7 1.5-1.5 1.5h-9C2.7 12.5 2 11.8 2 11V4.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <span className="name">{folder}</span>
      </button>
      {open && <div className="git-folder-body">{children}</div>}
    </div>
  );
}

function LocalRow({
  branch,
  active,
  onOpen,
  nested = false,
  flat = false,
}: {
  branch: BranchInfo;
  active: boolean;
  onOpen: (target: BranchTarget, event: React.MouseEvent) => void;
  nested?: boolean;
  flat?: boolean;
}) {
  const leaf = flat ? branch.name : splitFolder(branch.name)[1];
  return (
    <button
      type="button"
      className={`git-branch-row${nested ? " nested" : ""}${
        branch.isCurrent ? " current" : ""
      }${active ? " active" : ""}`}
      title={`${branch.subject}${branch.upstream !== null ? `\nupstream: ${branch.upstream}` : ""}`}
      onClick={(event) =>
        onOpen(
          {
            display: branch.name,
            ref: branch.name,
            isCurrent: branch.isCurrent,
            isRemote: false,
          },
          event,
        )
      }
    >
      <span className="git-branch-icon">
        {branch.isCurrent ? <StarIcon /> : <BranchIcon />}
      </span>
      <span className="name">{leaf}</span>
      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="track">
          {branch.ahead > 0 ? `↑${branch.ahead}` : ""}
          {branch.behind > 0 ? ` ↓${branch.behind}` : ""}
        </span>
      )}
      {branch.upstream !== null && <span className="upstream">{branch.upstream}</span>}
      <Chevron open={false} />
    </button>
  );
}
