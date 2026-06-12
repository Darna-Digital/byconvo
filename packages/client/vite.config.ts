import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env["PORT"] ?? 5173),
    proxy: {
      "/api": {
        target: "http://localhost:4317",
        changeOrigin: true,
      },
    },
  },
});
