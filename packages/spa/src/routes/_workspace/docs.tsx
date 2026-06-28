import { createFileRoute } from "@tanstack/react-router"
import { DocsPage } from "@/components/docs/DocsPage"

export const Route = createFileRoute("/_workspace/docs")({
  component: DocsPage,
})
