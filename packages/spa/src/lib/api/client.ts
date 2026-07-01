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
  /** Thread id — keys the persistent server-side PTY session for reconnects. */
  id: string
  agent: string
  cols: number
  rows: number
  /** Terminal theme, so the PTY can advertise its background brightness
   * (COLORFGBG) and agent CLIs pick readable colours. Only used on a fresh
   * spawn. */
  theme: "light" | "dark"
}): string => {
  const origin =
    desktopApiBaseUrl ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  const url = new URL("/api/threads/pty", origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("id", params.id)
  url.searchParams.set("agent", params.agent)
  url.searchParams.set("cols", String(params.cols))
  url.searchParams.set("rows", String(params.rows))
  url.searchParams.set("theme", params.theme)
  return url.toString()
}

/**
 * The ACP chat stream WebSocket URL for a chat. Same origin/port and `/api` ws
 * routing as {@link ptySocketUrl}; the server keys a persistent ACP agent
 * session by chat id, so the conversation survives reconnects. Unlike the PTY
 * socket this carries structured JSON events (message deltas, tool calls,
 * permission prompts), not raw terminal bytes.
 */
export const chatSocketUrl = (id: string): string => {
  const origin =
    desktopApiBaseUrl ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  const url = new URL("/api/chats/stream", origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("id", id)
  return url.toString()
}

/**
 * The PTY WebSocket URL for a Local Dev command's running process. Same
 * origin/port and `/api` ws routing as {@link ptySocketUrl}; the server attaches
 * the socket to the process the DevProcessManager already owns for `command`.
 */
export const devPtySocketUrl = (params: {
  /** Dev command id — the DevProcessManager keys its running process by it. */
  command: string
  cols: number
  rows: number
}): string => {
  const origin =
    desktopApiBaseUrl ??
    (typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin)
  const url = new URL("/api/local-dev/pty", origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("command", params.command)
  url.searchParams.set("cols", String(params.cols))
  url.searchParams.set("rows", String(params.rows))
  return url.toString()
}
