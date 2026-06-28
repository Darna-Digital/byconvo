/**
 * Typesafe API client — the SPA's only door to the server. Built from the
 * server's OpenAPI document (see `pnpm gen:api` → `schema.d.ts`) with
 * `openapi-fetch` + `openapi-react-query`, exactly like the darna-stack
 * web-client. `api` exposes typed `useQuery` / `useMutation` / `queryOptions`
 * bound to TanStack Query; `fetchClient` is the raw typed fetch for loaders.
 */
import createFetchClient from "openapi-fetch"
import createQueryClient from "openapi-react-query"
import type { paths } from "./schema"

type ByconvoWindow = Window & {
  byconvo?: {
    apiBaseUrl?: string
  }
}

const desktopApiBaseUrl =
  typeof window === "undefined"
    ? undefined
    : (window as ByconvoWindow).byconvo?.apiBaseUrl

/**
 * Browser/dev stays same-origin through Vite's proxy. Packaged Electron loads
 * from file://, so the preload bridge supplies the local API server origin.
 */
export const fetchClient = createFetchClient<paths>({
  baseUrl: desktopApiBaseUrl ?? "",
})

export const api = createQueryClient(fetchClient)

/**
 * The PTY WebSocket URL for a live terminal. Shares the API origin/port (the
 * server hosts the WS on the same port as the HttpApi), so it follows the same
 * routing: same-origin behind Vite's `/api` ws proxy in the browser, and the
 * desktop bridge's API origin in the packaged app.
 */
export const ptySocketUrl = (params: {
  agent: string
  cols: number
  rows: number
}): string => {
  const origin =
    desktopApiBaseUrl ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  const url = new URL("/api/threads/pty", origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("agent", params.agent)
  url.searchParams.set("cols", String(params.cols))
  url.searchParams.set("rows", String(params.rows))
  return url.toString()
}
