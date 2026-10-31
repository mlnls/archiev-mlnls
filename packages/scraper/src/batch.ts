import type { NormalizedJob } from "@archiev/core";
import {
  deactivateUnseen,
  finishBatchRun,
  getDb,
  idsWithoutDetail,
  listActiveJobs,
  startBatchRun,
  updateJobDetail,
  upsertJobs,
  type BatchStats,
  type Db,
} from "@archiev/db";
import { ensureProfile } from "./profile-seed";
import { rescoreAll } from "./rescore";
import { enabledSources, type SourceAdapter, type SourceContext } from "./sources";

export interface BatchOptions {
  trigger?: "schedule" | "manual" | "cli";
  /** 특정 소스만 (예: ["jumpit"]) */
  only?: string[];
  /** 이미 연결된 DB (테스트용) */
  db?: Db;
  /** 소스 목록 직접 주입 (테스트용) */
  sources?: SourceAdapter[];
  log?: (msg: string) => void;
  now?: () => Date;
}

export interface BatchResult {
  runId: number;
  status: "success" | "partial" | "failed";
  stats: BatchStats;
  errors: string[];
}

export async function runBatch(opts: BatchOptions = {}): Promise<BatchResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = opts.now ?? (() => new Date());
  const db = opts.db ?? (await getDb());
  const errors: string[] = [];
  const stats: BatchStats = { sources: {}, newJobs: 0, totalActive: 0, deactivated: 0, scored: 0, analyzed: 0, topNew: [] };

  const profile = await ensureProfile(db, log);
  const runId = await startBatchRun(db, opts.trigger ?? "cli");
  const ctx: SourceContext = {
    maxPages: Number(process.env.SCRAPE_MAX_PAGES ?? 5),
    delayMs: Number(process.env.SCRAPE_DELAY_MS ?? 800),
    log,
  };

  const sources = opts.sources ?? enabledSources(process.env, opts.only);
  if (!sources.length) errors.push("활성화된 수집 소스가 없습니다 (.env의 SOURCE_* / API 키 확인)");
  const newIds: string[] = [];

  // ── 1. 소스별 수집 ──
  for (const src of sources) {
    const t0 = Date.now();
    const startedAt = now();
    log(`▶ ${src.id} 수집 시작`);
    try {
      const listed = await src.list(ctx);
      const { newIds: fresh } = await upsertJobs(db, listed, startedAt);
      newIds.push(...fresh);

      // 상세 본문: 아직 본문이 없는 공고만, 소스별 상한까지
      let detailErrors = 0;
      if (src.detail) {
        const need = await idsWithoutDetail(db, listed.map((j) => j.id));
        const freshFirst = need.sort((a, b) => Number(fresh.includes(b)) - Number(fresh.includes(a)));
        const targets = listed.filter((j) => freshFirst.slice(0, src.detailLimit ?? 40).includes(j.id));
        for (const job of targets) {
          try {
            await updateJobDetail(db, await src.detail(job, ctx), now());
          } catch (e) {
            detailErrors++;
            if (detailErrors <= 3) log(`  상세 실패 ${job.id}: ${(e as Error).message}`);
          }
        }
        log(`  상세 ${targets.length - detailErrors}/${targets.length}건 수집`);
      }

      // 목록이 정상적으로 왔을 때만, 이번에 안 보인 공고를 마감 처리
      if (listed.length > 0) {
        const seenSince = new Date(startedAt.getTime() - (src.unseenGraceDays ?? 0) * 86_400_000);
        stats.deactivated += await deactivateUnseen(db, src.id, seenSince);
      }
      stats.sources[src.id] = { fetched: listed.length, new: fresh.length, durationMs: Date.now() - t0 };
      log(`✔ ${src.id}: ${listed.length}건 (신규 ${fresh.length})`);
    } catch (e) {
      const msg = `${src.id}: ${(e as Error).message}`;
      errors.push(msg);
      stats.sources[src.id] = { fetched: 0, new: 0, error: (e as Error).message, durationMs: Date.now() - t0 };
      log(`✖ ${msg}`);
    }
  }

  // ── 2. 전체 활성 공고 재채점 (프로필이 바뀌었을 수 있으므로 매번 전부) ──
  const active = await listActiveJobs(db);
  const results = await rescoreAll(db, profile, now());
  stats.totalActive = active.length;
  stats.scored = results.length;
  stats.newJobs = newIds.length;

  const byId = new Map(results.map((r) => [r.jobId, r]));
  const newRanked = newIds
    .map((id) => byId.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m && !m.excluded)
    .sort((a, b) => b.score - a.score);
  const jobById = new Map<string, NormalizedJob>(active.map((j) => [j.id, j]));
  stats.topNew = newRanked.slice(0, 10).map((m) => ({
    id: m.jobId,
    title: jobById.get(m.jobId)?.title ?? "",
    company: jobById.get(m.jobId)?.company ?? "",
    score: m.score,
  }));

  const sourceFailures = Object.values(stats.sources).filter((s) => s.error).length;
  const status: BatchResult["status"] =
    sources.length > 0 && sourceFailures === sources.length ? "failed" : errors.length ? "partial" : "success";
  await finishBatchRun(db, runId, status, stats, errors);
  log(`■ 완료 (${status}) 신규 ${stats.newJobs} · 활성 ${stats.totalActive} · 비활성화 ${stats.deactivated}`);
  return { runId, status, stats, errors };
}

/** DB에 쓰지 않고 소스별 첫 페이지만 받아서 파싱 결과를 확인합니다 */
export async function dryRun(only?: string[], log: (m: string) => void = console.log) {
  const ctx: SourceContext = { maxPages: 1, delayMs: 500, log };
  for (const src of enabledSources(process.env, only)) {
    try {
      const jobs = await src.list(ctx);
      log(`✔ ${src.id}: ${jobs.length}건`);
      const sample = jobs[0];
      if (sample) {
        const detailed = src.detail ? await src.detail(sample, ctx) : sample;
        log(JSON.stringify({ ...detailed, description: detailed.description ? "(본문 있음)" : null }, null, 2));
      }
    } catch (e) {
      log(`✖ ${src.id}: ${(e as Error).message}`);
    }
  }
}
