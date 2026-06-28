import { createFileRoute } from "@tanstack/react-router"
import { KanbanPage } from "@/components/kanban/KanbanPage"

export const Route = createFileRoute("/_workspace/kanban")({
  component: KanbanPage,
})
