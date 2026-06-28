import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const SERVER_URL = process.env.BYCONVO_SERVER_URL ?? "http://localhost:41811"
const isProduction = process.env.NODE_ENV === "production"

const config = defineConfig({
  base: isProduction ? "./" : "/",
  resolve: { tsconfigPaths: true },
  // No SSR — byconvo is a local single-page app served behind the API server.
  plugins: [
    ...(!isProduction ? [devtools()] : []),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
  server: {
    port: 41812,
    proxy: {
      // `ws: true` also proxies the live-terminal PTY WebSocket upgrade
      // (/api/threads/pty) through to the API server.
      "/api": { target: SERVER_URL, changeOrigin: true, ws: true },
    },
  },
  // The desktop shell loads the built SPA via `vite preview` in prod; keep the
  // port and `/api` proxy aligned with the dev server above.
  preview: {
    port: 41812,
    proxy: {
      // `ws: true` also proxies the live-terminal PTY WebSocket upgrade
      // (/api/threads/pty) through to the API server.
      "/api": { target: SERVER_URL, changeOrigin: true, ws: true },
    },
  },
})

export default config
