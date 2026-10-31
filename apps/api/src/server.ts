import { serve } from "@hono/node-server";
import { Cron } from "croner";
import { getDb } from "@archiev/db";
import { configFromEnv, createApp } from "./app";

const cfg = configFromEnv();
for (const key of ["sessionSecret", "adminPasswordHash", "workerToken"] as const) {
  if (!cfg[key]) throw new Error(`환경 변수가 비어 있습니다: ${key}`);
}

await getDb(); // 마이그레이션을 먼저 끝냅니다

const { app, startBatch } = createApp(cfg);

// 매일 아침 8시(KST) 전체 수집
const schedule = process.env.BATCH_CRON || "0 8 * * *";
const cron = new Cron(schedule, { timezone: "Asia/Seoul", protect: true }, () => {
  startBatch("schedule");
});
console.log(`batch schedule: ${schedule} (next ${cron.nextRun()?.toISOString()})`);

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, () => console.log(`api listening on :${port}`));
