import { useEffect, useState } from "react";
import type { BranchInfo, LogQuery } from "../types";

interface LogFiltersProps {
  refName: string;
  branches: ReadonlyArray<BranchInfo>;
  query: LogQuery;
  onRefChange: (ref: string) => void;
  onQueryChange: (query: LogQuery) => void;
}

// Text fields apply on Enter/blur; toggles, the branch picker and the date
// apply immediately. A local draft keeps typing responsive between commits.
export function LogFilters({
  refName,
  branches,
  query,
  onRefChange,
  onQueryChange,
}: LogFiltersProps) {
  const [grep, setGrep] = useState(query.grep ?? "");
  const [author, setAuthor] = useState(query.author ?? "");
  const [path, setPath] = useState(query.path ?? "");

  // Keep the drafts in sync when the query is reset from outside (e.g. Clear).
  useEffect(() => setGrep(query.grep ?? ""), [query.grep]);
  useEffect(() => setAuthor(query.author ?? ""), [query.author]);
  useEffect(() => setPath(query.path ?? ""), [query.path]);

  const blank = (value: string): string | null =>
    value.trim().length > 0 ? value.trim() : null;

  const apply = (patch: Partial<LogQuery>) => onQueryChange({ ...query, ...patch });

  const hasFilters =
    query.grep !== null ||
    query.author !== null ||
    query.path !== null ||
    query.after !== null ||
    query.before !== null;

  return (
    <div className="log-filters">
      <select
        className="filter-select"
        value={refName}
        onChange={(event) => onRefChange(event.target.value)}
        title="Branch"
      >
        {branches.every((b) => b.name !== refName) && <option value={refName}>{refName}</option>}
        {branches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name}
          </option>
        ))}
      </select>

      <div className="filter-search">
        <input
          type="text"
          placeholder="Text or hash"
          value={grep}
          onChange={(event) => setGrep(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply({ grep: blank(grep) });
          }}
          onBlur={() => apply({ grep: blank(grep) })}
        />
        <button
          type="button"
          className={`filter-toggle ${query.regex ? "active" : ""}`}
          title="Regular expression"
          onClick={() => onQueryChange({ ...query, grep: blank(grep), regex: !query.regex })}
        >
          .*
        </button>
        <button
          type="button"
          className={`filter-toggle ${query.caseSensitive ? "active" : ""}`}
          title="Match case"
          onClick={() =>
            onQueryChange({ ...query, grep: blank(grep), caseSensitive: !query.caseSensitive })
          }
        >
          Cc
        </button>
      </div>

      <input
        className="filter-input"
        type="text"
        placeholder="User"
        value={author}
        onChange={(event) => setAuthor(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply({ author: blank(author) });
        }}
        onBlur={() => apply({ author: blank(author) })}
      />

      <input
        className="filter-input filter-date"
        type="date"
        value={query.after ?? ""}
        title="Since date"
        onChange={(event) => apply({ after: event.target.value.length > 0 ? event.target.value : null })}
      />

      <input
        className="filter-input"
        type="text"
        placeholder="Paths"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply({ path: blank(path) });
        }}
        onBlur={() => apply({ path: blank(path) })}
      />

      {hasFilters && (
        <button
          type="button"
          className="filter-clear"
          title="Clear filters"
          onClick={() =>
            onQueryChange({
              author: null,
              grep: null,
              regex: query.regex,
              caseSensitive: query.caseSensitive,
              after: null,
              before: null,
              path: null,
            })
          }
        >
          Clear
        </button>
      )}
    </div>
  );
}
