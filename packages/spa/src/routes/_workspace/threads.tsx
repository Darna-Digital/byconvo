import { createFileRoute } from "@tanstack/react-router"
import { ThreadsPage } from "@/components/threads/ThreadsPage"

export const Route = createFileRoute("/_workspace/threads")({
  component: ThreadsPage,
})
