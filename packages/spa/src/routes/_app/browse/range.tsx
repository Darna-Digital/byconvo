import { createFileRoute } from "@tanstack/react-router"

// Range diff (base...head) — base/head come from the typed _app search params.
export const Route = createFileRoute("/_app/browse/range")({
  component: () => null,
})
