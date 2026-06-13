import type { ReactElement } from "react";
import type { CommitDetail, CommitFileChange, GitFileStatus } from "../types";

interface CommitDetailsProps {
  detail: CommitDetail | null;
  loading: boolean;
  onSelectFile: (path: string) => void;
}

const STATUS_LETTER: Record<GitFileStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  untracked: "A",
  ignored: "I",
};

const formatDateTime = (iso: string): string => {
  if (iso.length === 0) return "";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface FileNode {
  name: string;
  children: Map<string, FileNode>;
  file: CommitFileChange | null;
}

const buildFileTree = (files: ReadonlyArray<CommitFileChange>): FileNode => {
  const root: FileNode = { name: "", children: new Map(), file: null };
  for (const file of files) {
    const segments = file.path.split("/");
    let node = root;
    segments.forEach((segment, index) => {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { name: segment, children: new Map(), file: null };
        node.children.set(segment, child);
      }
      if (index === segments.length - 1) child.file = file;
      node = child;
    });
  }
  return root;
};

const countFiles = (node: FileNode): number =>
  node.file !== null
    ? 1
    : [...node.children.values()].reduce((sum, child) => sum + countFiles(child), 0);

// Collapse single-child folder chains into one row (a/b/c), like JetBrains.
const collapse = (node: FileNode): { label: string; node: FileNode } => {
  let label = node.name;
  let current = node;
  while (current.file === null && current.children.size === 1) {
    const [only] = [...current.children.values()];
    if (only === undefined || only.file !== null) break;
    label = `${label}/${only.name}`;
    current = only;
  }
  return { label, node: current };
};

const renderNode = (
  node: FileNode,
  depth: number,
  onSelectFile: (path: string) => void,
): Array<ReactElement> => {
  const folders: Array<FileNode> = [];
  const leaves: Array<FileNode> = [];
  for (const child of node.children.values()) {
    (child.file !== null ? leaves : folders).push(child);
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  leaves.sort((a, b) => a.name.localeCompare(b.name));

  const rows: Array<ReactElement> = [];
  const indent = (level: number) => ({ paddingLeft: 8 + level * 14 });

  for (const folder of folders) {
    const { label, node: deepest } = collapse(folder);
    rows.push(
      <div key={`d:${label}:${depth}`} className="detail-file-folder" style={indent(depth)}>
        <span className="detail-folder-name">{label}</span>
        <span className="detail-folder-count">{countFiles(deepest)}</span>
      </div>,
    );
    rows.push(...renderNode(deepest, depth + 1, onSelectFile));
  }

  for (const leaf of leaves) {
    const file = leaf.file as CommitFileChange;
    rows.push(
      <button
        key={`f:${file.path}`}
        type="button"
        className="detail-file"
        style={indent(depth)}
        onClick={() => onSelectFile(file.path)}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      >
        <span className={`status-letter status-${file.status}`}>
          {STATUS_LETTER[file.status]}
        </span>
        <span className="detail-file-name">{leaf.name}</span>
      </button>,
    );
  }

  return rows;
};

export function CommitDetails({ detail, loading, onSelectFile }: CommitDetailsProps) {
  if (loading) {
    return <div className="commit-details empty-note">Loading commit…</div>;
  }
  if (detail === null) {
    return (
      <div className="commit-details empty-note">Select a commit to see its details.</div>
    );
  }

  const tree = buildFileTree(detail.files);

  return (
    <div className="commit-details">
      <div className="detail-message">{detail.subject}</div>
      {detail.body.length > 0 && <div className="detail-body">{detail.body}</div>}

      <div className="detail-meta">
        <span className="detail-sha">{detail.shortSha}</span>
        <span className="detail-author">{detail.author}</span>
        {detail.authorEmail.length > 0 && (
          <span className="detail-email">&lt;{detail.authorEmail}&gt;</span>
        )}
        <span className="detail-date">{formatDateTime(detail.authoredAt)}</span>
      </div>

      {detail.refs.length > 0 && (
        <div className="detail-refs">
          {detail.refs.map((ref) => (
            <span key={ref} className="ref-badge">
              {ref}
            </span>
          ))}
        </div>
      )}

      <div className="detail-files-title">
        {detail.files.length} {detail.files.length === 1 ? "file" : "files"}
      </div>
      <div className="detail-files">{renderNode(tree, 0, onSelectFile)}</div>

      {detail.containingBranches.length > 0 && (
        <div className="detail-contains">
          <span className="detail-contains-label">
            In {detail.containingBranches.length}{" "}
            {detail.containingBranches.length === 1 ? "branch" : "branches"}:
          </span>{" "}
          {detail.containingBranches.join(", ")}
        </div>
      )}
    </div>
  );
}
