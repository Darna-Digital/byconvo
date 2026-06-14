import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const SERVER_URL = process.env.REVIEWER_SERVER_URL ?? "http://localhost:41811"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // No SSR — reviewer is a local single-page app served behind the API server.
  plugins: [devtools(), tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
  server: {
    port: 41812,
    proxy: {
      "/api": { target: SERVER_URL, changeOrigin: true },
    },
  },
  // The desktop shell loads the built SPA via `vite preview` in prod; keep the
  // port and `/api` proxy aligned with the dev server above.
  preview: {
    port: 41812,
    proxy: {
      "/api": { target: SERVER_URL, changeOrigin: true },
    },
  },
})

export default config
