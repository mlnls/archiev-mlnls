import { closeDb } from "@archiev/db";
import { dryRun, runBatch } from "./batch";

/**
 * pnpm batch                      전체 수집 + 채점
 * pnpm batch --only jobkorea      특정 소스만
 * pnpm batch --dry-run            DB 저장 없이 첫 페이지만 받아 파싱 확인
 */
const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = value("only")?.split(",").map((s) => s.trim()).filter(Boolean);

try {
  if (args.includes("--dry-run")) {
    await dryRun(only);
  } else {
    const r = await runBatch({ trigger: "cli", only });
    if (r.status === "failed") process.exitCode = 1;
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await closeDb();
}
