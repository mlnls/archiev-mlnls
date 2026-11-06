import { readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp, DEFAULTS } from "./app";
import { Store } from "./store";

const env = process.env;
const cfg = {
  username: env.ARCHIVE_USERNAME ?? "",
  passwordHash: env.ARCHIVE_PASSWORD_HASH ?? "",
  sessionSecret: env.ARCHIVE_SESSION_SECRET ?? "",
  origin: env.ARCHIVE_ORIGIN ?? "",
  secureCookie: env.NODE_ENV === "production",
  maxFileBytes: Number(env.ARCHIVE_MAX_FILE_BYTES) || DEFAULTS.maxFileBytes,
  minFreeBytes: Number(env.ARCHIVE_MIN_FREE_BYTES) || DEFAULTS.minFreeBytes,
};
for (const key of ["username", "passwordHash", "sessionSecret"] as const) {
  if (!cfg[key]) throw new Error(`환경 변수가 비어 있습니다: ${key}`);
}

const store = await new Store(path.resolve(env.ARCHIVE_DATA_DIR ?? ".data/archive")).init();
const app = createApp(cfg, store);

// 화면 파일 (vite 빌드 결과)
const publicDir = path.resolve(env.ARCHIVE_PUBLIC_DIR ?? "dist/public");
app.use(
  "/assets/*",
  serveStatic({
    root: publicDir,
    onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
  }),
);
const indexHtml = (() => {
  try {
    return readFileSync(path.join(publicDir, "index.html"), "utf8");
  } catch {
    return "<!doctype html><p>화면 빌드가 없습니다. pnpm dev로 여세요.</p>";
  }
})();
app.get("*", (c) => {
  c.header("Cache-Control", "no-cache");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(indexHtml);
});

const port = Number(env.PORT ?? 4100);
serve({ fetch: app.fetch, port }, () => console.log(`archive listening on :${port}`));
