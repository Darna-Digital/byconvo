/**
 * `commit-details` feature — turns a commit's flat file-change list into the
 * collapsed folder/file rows the details pane renders (single-child folder
 * chains collapse to `a/b/c`, folders carry a descendant count). Pure: the
 * commit data is fetched by the panel; this layer only shapes it for display.
 */
import type { CommitFileChange, GitFileStatus } from "@/lib/api/types"

export interface DetailFolderRow {
  readonly kind: "folder"
  readonly label: string
  readonly depth: number
  readonly count: number
}

export interface DetailFileRow {
  readonly kind: "file"
  readonly depth: number
  readonly name: string
  readonly file: CommitFileChange
}

export type DetailRow = DetailFolderRow | DetailFileRow

export interface CommitDetailsDependencies {
  readonly data: Record<string, never>
  readonly sideEffects: Record<string, never>
}

export interface CommitDetailsFunctions {
  /** Flatten the changed files into ordered, indented folder/file rows. */
  readonly buildRows: (files: ReadonlyArray<CommitFileChange>) => ReadonlyArray<DetailRow>
  /** The single-letter status badge for a change (A/D/M/R/…). */
  readonly statusLetter: (status: GitFileStatus) => string
}

export const STATUS_LETTER: Record<string, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  untracked: "A",
  ignored: "I",
}
