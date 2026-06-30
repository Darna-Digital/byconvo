import { createFileRoute } from "@tanstack/react-router"
import { LocalDevPage } from "@/components/local-dev/LocalDevPage"

export const Route = createFileRoute("/_workspace/local-dev")({
  component: LocalDevPage,
})
