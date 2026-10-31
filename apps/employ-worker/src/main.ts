import { createApi, createRunner, processJob } from "./worker";

const API_URL = process.env.API_URL ?? "https://employ.mlnl.site/api";
const WORKER_TOKEN = process.env.WORKER_TOKEN;
if (!WORKER_TOKEN) {
  console.error("WORKER_TOKEN이 없습니다. ~/.archiev/worker.env 를 확인해 주세요.");
  process.exit(1);
}

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 15_000);
const MODEL = process.env.CLAUDE_MODEL ?? "sonnet";
const api = createApi(API_URL, WORKER_TOKEN);
const run = createRunner(process.env.CLAUDE_BIN ?? "claude");
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

log(`워커 시작: ${API_URL}`);
while (!stopping) {
  try {
    const claimed = await api.claim();
    if (claimed) {
      await processJob(claimed, api, run, { model: MODEL, figmaFileKey: process.env.FIGMA_FILE_KEY, log });
      continue;
    }
  } catch (e) {
    log(`폴링 실패: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
log("워커 종료");
