import { createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/layout/AppShell"

/** Cross-mode view state lives in typed search params (no `useState` soup). */
export interface AppSearch {
  /** Open file overlay path. */
  file?: string
  /** Whether the open file is in the editor (vs read-only view). */
  edit?: boolean
  /** Selected file to scroll the diff to. */
  path?: string
  /** Range-diff base/head (browse mode). */
  base?: string
  head?: string
}

export const Route = createFileRoute("/_app")({
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    file: typeof search["file"] === "string" ? search["file"] : undefined,
    edit: search["edit"] === true || search["edit"] === "true" ? true : undefined,
    path: typeof search["path"] === "string" ? search["path"] : undefined,
    base: typeof search["base"] === "string" ? search["base"] : undefined,
    head: typeof search["head"] === "string" ? search["head"] : undefined,
  }),
  component: AppShell,
})
