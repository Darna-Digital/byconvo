import { createFileRoute } from "@tanstack/react-router"

// Browse a single commit's diff. `sha` is a typed path param read by AppShell.
export const Route = createFileRoute("/_app/browse/commit/$sha")({
  component: () => null,
})
