import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  server: {
    proxy: {
      "/api": {
        target: process.env.API_INTERNAL_URL ?? "http://localhost:4000",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: { environment: "jsdom" },
});
