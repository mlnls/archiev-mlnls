import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/public", sourcemap: false },
  server: {
    proxy: {
      "/api": process.env.ARCHIVE_DEV_SERVER ?? "http://localhost:4100",
      "/files": process.env.ARCHIVE_DEV_SERVER ?? "http://localhost:4100",
    },
  },
  test: { environment: "jsdom" },
});
