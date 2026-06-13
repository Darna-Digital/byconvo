import { useState } from "react";
import type { BranchInfo, RemoteBranchInfo } from "../types";

interface BranchTreeProps {
  branches: ReadonlyArray<BranchInfo>;
  remoteBranches: ReadonlyArray<RemoteBranchInfo>;
  currentBranch: string | null;
  selectedRef: string | null;
  onSelect: (ref: string) => void;
  onCheckout: (ref: string) => void;
}

interface Leaf {
  kind: "branch";
  label: string;
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
  ahead: number;
  behind: number;
}

interface Folder {
  kind: "folder";
  label: string;
  path: string;
  children: Array<TreeItem>;
}

type TreeItem = Leaf | Folder;

const FAV_KEY = "codediff-fav-branches";

const loadFavorites = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as Array<string>) : []);
  } catch {
    return new Set();
  }
};

const sortTree = (items: Array<TreeItem>, favorites: Set<string>): Array<TreeItem> => {
  const score = (item: TreeItem) => {
    // Folders before leaves; favourite branches float above the rest.
    if (item.kind === "folder") return 0;
    return favorites.has(item.fullName) ? 1 : 2;
  };
  return [...items]
    .sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label))
    .map((item) =>
      item.kind === "folder"
        ? { ...item, children: sortTree(item.children, favorites) }
        : item,
    );
};

const buildTree = (
  entries: Array<{ segments: Array<string>; leaf: Leaf }>,
  favorites: Set<string>,
): Array<TreeItem> => {
  const root: Folder = { kind: "folder", label: "", path: "", children: [] };
  const folderAt = (parent: Folder, name: string, path: string): Folder => {
    const existing = parent.children.find(
      (c): c is Folder => c.kind === "folder" && c.label === name,
    );
    if (existing) return existing;
    const created: Folder = { kind: "folder", label: name, path, children: [] };
    parent.children.push(created);
    return created;
  };
  for (const { segments, leaf } of entries) {
    let parent = root;
    for (let i = 0; i < segments.length - 1; i++) {
      parent = folderAt(parent, segments[i] as string, segments.slice(0, i + 1).join("/"));
    }
    parent.children.push(leaf);
  }
  return sortTree(root.children, favorites);
};

function BranchIcon() {
  return (
    <svg className="git-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6v4M6 4.6c3 .8 4 1.6 4.4 1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

interface RowsProps {
  items: ReadonlyArray<TreeItem>;
  depth: number;
  expanded: Set<string>;
  favorites: Set<string>;
  selectedRef: string | null;
  onToggleFolder: (path: string) => void;
  onToggleFavorite: (name: string) => void;
  onSelect: (ref: string) => void;
  onCheckout: (ref: string) => void;
}

function TreeRows(props: RowsProps) {
  const { items, depth, expanded } = props;
  const indent = (level: number) => ({ paddingLeft: 8 + level * 14 });

  return (
    <>
      {items.map((item) => {
        if (item.kind === "folder") {
          const open = expanded.has(item.path);
          return (
            <div key={`f:${item.path}`}>
              <button
                type="button"
                className="tree-folder"
                style={indent(depth)}
                onClick={() => props.onToggleFolder(item.path)}
              >
                <span className={`tree-chevron ${open ? "open" : ""}`}>▸</span>
                <span className="tree-folder-name">{item.label}</span>
              </button>
              {open && (
                <TreeRows {...props} items={item.children} depth={depth + 1} />
              )}
            </div>
          );
        }
        const fav = props.favorites.has(item.fullName);
        return (
          <div
            key={`b:${item.fullName}`}
            className={`tree-branch ${item.isCurrent ? "current" : ""} ${
              props.selectedRef === item.fullName ? "selected" : ""
            }`}
            style={indent(depth)}
            onClick={() => props.onSelect(item.fullName)}
            onDoubleClick={() => props.onCheckout(item.fullName)}
            title={`${item.fullName}\nDouble-click to checkout`}
            role="treeitem"
          >
            <button
              type="button"
              className={`tree-star ${fav ? "on" : ""}`}
              title={fav ? "Unfavorite" : "Favorite"}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleFavorite(item.fullName);
              }}
            >
              {fav ? "★" : "☆"}
            </button>
            <BranchIcon />
            <span className="tree-branch-name">{item.label}</span>
            {item.isCurrent && <span className="current-badge">HEAD</span>}
            {(item.behind > 0 || item.ahead > 0) && (
              <span className="tree-track">
                {item.behind > 0 && <span title={`${item.behind} incoming`}>↓{item.behind}</span>}
                {item.ahead > 0 && <span title={`${item.ahead} outgoing`}>↑{item.ahead}</span>}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export function BranchTree({
  branches,
  remoteBranches,
  currentBranch,
  selectedRef,
  onSelect,
  onCheckout,
}: BranchTreeProps) {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["__local", "__remote"]));

  const toggleFolder = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const toggleFavorite = (name: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });

  const localTree = buildTree(
    branches.map((branch) => ({
      segments: branch.name.split("/"),
      leaf: {
        kind: "branch" as const,
        label: branch.name.split("/").at(-1) ?? branch.name,
        fullName: branch.name,
        isCurrent: branch.isCurrent,
        isRemote: false,
        ahead: branch.ahead,
        behind: branch.behind,
      },
    })),
    favorites,
  );

  // Remote branches nest under their remote name (origin/…) just like JetBrains.
  const remoteTree = buildTree(
    remoteBranches.map((branch) => ({
      segments: branch.name.split("/"),
      leaf: {
        kind: "branch" as const,
        label: branch.shortName.split("/").at(-1) ?? branch.shortName,
        fullName: branch.name,
        isCurrent: false,
        isRemote: true,
        ahead: 0,
        behind: 0,
      },
    })),
    favorites,
  );

  const rowProps = {
    expanded,
    favorites,
    selectedRef,
    onToggleFolder: toggleFolder,
    onToggleFavorite: toggleFavorite,
    onSelect,
    onCheckout,
  };

  return (
    <div className="branch-tree" role="tree">
      {currentBranch !== null && (
        <button
          type="button"
          className={`tree-head ${selectedRef === currentBranch ? "selected" : ""}`}
          onClick={() => onSelect(currentBranch)}
          title="Current branch"
        >
          <span className="tree-head-label">HEAD</span>
          <span className="tree-head-branch">{currentBranch}</span>
        </button>
      )}

      <button
        type="button"
        className="tree-section"
        onClick={() => toggleFolder("__local")}
      >
        <span className={`tree-chevron ${expanded.has("__local") ? "open" : ""}`}>▸</span>
        Local
      </button>
      {expanded.has("__local") && (
        <TreeRows {...rowProps} items={localTree} depth={1} />
      )}

      {remoteTree.length > 0 && (
        <>
          <button
            type="button"
            className="tree-section"
            onClick={() => toggleFolder("__remote")}
          >
            <span className={`tree-chevron ${expanded.has("__remote") ? "open" : ""}`}>▸</span>
            Remote
          </button>
          {expanded.has("__remote") && (
            <TreeRows {...rowProps} items={remoteTree} depth={1} />
          )}
        </>
      )}
    </div>
  );
}
