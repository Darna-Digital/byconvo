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

/** Same-origin: the Vite dev server proxies `/api` to the reviewer server. */
export const fetchClient = createFetchClient<paths>({ baseUrl: "" })

export const api = createQueryClient(fetchClient)
