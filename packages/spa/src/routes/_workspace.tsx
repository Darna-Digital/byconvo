import { createFileRoute } from "@tanstack/react-router"
import { WorkspaceShell } from "@/components/layout/WorkspaceShell"

/**
 * Pathless layout for the workspace feature pages (threads, docs, kanban). It
 * renders the shared mode rail + frame; the matched child page fills the rest.
 */
export const Route = createFileRoute("/_workspace")({
  component: WorkspaceShell,
})
