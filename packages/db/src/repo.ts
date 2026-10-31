import type { MatchResult, NormalizedJob, Profile } from "@archiev/core";
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Db } from "./client";
import {
  analyses,
  batchRuns,
  jobStatus,
  jobs,
  matches,
  profileImports,
  profiles,
  type AnalysisKind,
  type BatchStats,
  type ImportKind,
  type JobRow,
  type JobStatus,
} from "./schema";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

export function rowToJob(r: JobRow): NormalizedJob {
  return {
    id: r.id,
    source: r.source as NormalizedJob["source"],
    externalId: r.externalId,
    url: r.url,
    title: r.title,
    company: r.company,
    companyLogo: r.companyLogo,
    location: r.location,
    categories: r.categories,
    techStacks: r.techStacks,
    minCareer: r.minCareer,
    maxCareer: r.maxCareer,
    newcomer: r.newcomer,
    employmentType: r.employmentType,
    deadline: iso(r.deadline),
    alwaysOpen: r.alwaysOpen,
    postedAt: iso(r.postedAt),
    salaryText: r.salaryText,
    educationText: r.educationText,
    tags: r.tags,
    description: r.description ?? null,
  };
}

function jobValues(j: NormalizedJob, now: Date) {
  return {
    id: j.id,
    source: j.source,
    externalId: j.externalId,
    url: j.url,
    title: j.title,
    company: j.company,
    companyLogo: j.companyLogo,
    location: j.location,
    categories: j.categories,
    techStacks: j.techStacks,
    minCareer: j.minCareer,
    maxCareer: j.maxCareer,
    newcomer: j.newcomer,
    employmentType: j.employmentType,
    deadline: toDate(j.deadline),
    alwaysOpen: j.alwaysOpen,
    postedAt: toDate(j.postedAt),
    salaryText: j.salaryText,
    educationText: j.educationText,
    tags: j.tags,
    description: j.description,
    detailFetchedAt: j.description ? now : null,
    active: true,
    lastSeenAt: now,
  };
}

// ─────────────── 수집 배치용 ───────────────

/** 공고를 넣거나 갱신하고, 이번에 처음 본 공고 id를 돌려줍니다 */
export async function upsertJobs(db: Db, list: NormalizedJob[], now = new Date()): Promise<{ newIds: string[] }> {
  if (list.length === 0) return { newIds: [] };
  const unique = [...new Map(list.map((j) => [j.id, j])).values()];
  const ids = unique.map((j) => j.id);
  const existing = new Set(
    (await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, ids))).map((r) => r.id),
  );
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200).map((j) => ({ ...jobValues(j, now), firstSeenAt: now }));
    await db
      .insert(jobs)
      .values(chunk)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          url: sql`excluded.url`,
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          companyLogo: sql`coalesce(excluded.company_logo, ${jobs.companyLogo})`,
          location: sql`coalesce(excluded.location, ${jobs.location})`,
          categories: sql`excluded.categories`,
          techStacks: sql`case when json_array_length(excluded.tech_stacks) > 0 then excluded.tech_stacks else ${jobs.techStacks} end`,
          minCareer: sql`excluded.min_career`,
          maxCareer: sql`excluded.max_career`,
          newcomer: sql`excluded.newcomer`,
          employmentType: sql`coalesce(excluded.employment_type, ${jobs.employmentType})`,
          deadline: sql`excluded.deadline`,
          alwaysOpen: sql`excluded.always_open`,
          postedAt: sql`coalesce(excluded.posted_at, ${jobs.postedAt})`,
          salaryText: sql`coalesce(excluded.salary_text, ${jobs.salaryText})`,
          educationText: sql`coalesce(excluded.education_text, ${jobs.educationText})`,
          tags: sql`excluded.tags`,
          // 목록 API에는 본문이 없으므로 기존 상세 본문을 지우지 않습니다
          description: sql`coalesce(excluded.description, ${jobs.description})`,
          detailFetchedAt: sql`coalesce(excluded.detail_fetched_at, ${jobs.detailFetchedAt})`,
          active: true,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }
  return { newIds: ids.filter((id) => !existing.has(id)) };
}

/** 이번 수집에서 보이지 않은 공고를 비활성화 (해당 소스 수집이 성공했을 때만 호출) */
export async function deactivateUnseen(db: Db, source: string, seenSince: Date): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ active: false })
    .where(and(eq(jobs.source, source), eq(jobs.active, true), lt(jobs.lastSeenAt, seenSince)))
    .returning({ id: jobs.id });
  return rows.length;
}

export async function idsWithoutDetail(db: Db, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(inArray(jobs.id, ids), isNull(jobs.detailFetchedAt)));
  return rows.map((r) => r.id);
}

export async function updateJobDetail(db: Db, job: NormalizedJob, now = new Date()) {
  await db
    .update(jobs)
    .set({
      description: job.description,
      techStacks: job.techStacks,
      location: job.location,
      deadline: toDate(job.deadline),
      alwaysOpen: job.alwaysOpen,
      postedAt: toDate(job.postedAt),
      educationText: job.educationText,
      employmentType: job.employmentType,
      salaryText: job.salaryText,
      tags: job.tags,
      detailFetchedAt: now,
    })
    .where(eq(jobs.id, job.id));
}

export async function listActiveJobs(db: Db): Promise<(NormalizedJob & { firstSeenAt: string })[]> {
  const rows = await db.select().from(jobs).where(eq(jobs.active, true));
  return rows.map((r) => ({ ...rowToJob(r), firstSeenAt: r.firstSeenAt.toISOString() }));
}

export async function getJobsByIds(db: Db, ids: string[]): Promise<NormalizedJob[]> {
  if (!ids.length) return [];
  return (await db.select().from(jobs).where(inArray(jobs.id, ids))).map(rowToJob);
}

export async function saveMatches(db: Db, results: MatchResult[], now = new Date()) {
  for (let i = 0; i < results.length; i += 200) {
    const chunk = results.slice(i, i + 200).map((m) => ({
      jobId: m.jobId,
      score: m.score,
      track: m.track,
      excluded: m.excluded,
      result: m,
      computedAt: now,
    }));
    if (!chunk.length) continue;
    await db
      .insert(matches)
      .values(chunk)
      .onConflictDoUpdate({
        target: matches.jobId,
        set: {
          score: sql`excluded.score`,
          track: sql`excluded.track`,
          excluded: sql`excluded.excluded`,
          result: sql`excluded.result`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }
}

export async function startBatchRun(db: Db, trigger: string) {
  const [row] = await db.insert(batchRuns).values({ trigger, status: "running" }).returning({ id: batchRuns.id });
  return row!.id;
}

export async function finishBatchRun(
  db: Db,
  id: number,
  status: "success" | "partial" | "failed",
  stats: BatchStats | null,
  errors: string[],
) {
  await db.update(batchRuns).set({ status, stats, errors, finishedAt: new Date() }).where(eq(batchRuns.id, id));
}

export async function latestBatchRuns(db: Db, limit = 10) {
  return db.select().from(batchRuns).orderBy(desc(batchRuns.startedAt)).limit(limit);
}

// ─────────────── 프로필 ───────────────

export async function getProfile(db: Db): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, "me"));
  return row?.data ?? null;
}

export async function saveProfile(db: Db, data: Profile) {
  await db
    .insert(profiles)
    .values({ id: "me", data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: profiles.id, set: { data, updatedAt: new Date() } });
}

export async function addProfileImport(db: Db, kind: ImportKind, label: string, text: string) {
  await db.insert(profileImports).values({ kind, label, text });
}

export async function listProfileImports(db: Db) {
  return db.select().from(profileImports).orderBy(desc(profileImports.createdAt));
}

export async function deleteProfileImport(db: Db, id: number) {
  await db.delete(profileImports).where(eq(profileImports.id, id));
}

// ─────────────── 화면용 조회 ───────────────

export interface JobListFilter {
  track?: "frontend" | "infra" | "all";
  source?: string;
  minScore?: number;
  q?: string;
  onlyNewSince?: Date;
  includeExcluded?: boolean;
  status?: JobStatus | "none" | "any";
  limit?: number;
  offset?: number;
}

export interface JobListItem {
  job: NormalizedJob;
  firstSeenAt: Date;
  match: MatchResult | null;
  status: JobStatus | null;
}

export async function listJobs(db: Db, f: JobListFilter = {}): Promise<{ items: JobListItem[]; total: number }> {
  const where: SQL[] = [eq(jobs.active, true)];
  if (!f.includeExcluded) where.push(sql`coalesce(${matches.excluded}, 0) = 0`);
  if (f.track && f.track !== "all") where.push(eq(matches.track, f.track));
  if (f.source) where.push(eq(jobs.source, f.source));
  if (f.minScore) where.push(gte(matches.score, f.minScore));
  if (f.onlyNewSince) where.push(gte(jobs.firstSeenAt, f.onlyNewSince));
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    where.push(
      sql`(lower(${jobs.title}) like ${like} or lower(${jobs.company}) like ${like} or lower(${jobs.techStacks}) like ${like})`,
    );
  }
  if (f.status === "none") where.push(sql`(${jobStatus.status} is null)`);
  else if (f.status && f.status !== "any") where.push(eq(jobStatus.status, f.status));
  else where.push(sql`coalesce(${jobStatus.status}, '') <> 'hidden'`);

  const cond = and(...where);
  const base = db
    .select({ job: jobs, match: matches, status: jobStatus.status })
    .from(jobs)
    .leftJoin(matches, eq(matches.jobId, jobs.id))
    .leftJoin(jobStatus, eq(jobStatus.jobId, jobs.id))
    .where(cond);

  const rows = await base
    .orderBy(desc(sql`coalesce(${matches.score}, 0)`), desc(jobs.firstSeenAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(jobs)
    .leftJoin(matches, eq(matches.jobId, jobs.id))
    .leftJoin(jobStatus, eq(jobStatus.jobId, jobs.id))
    .where(cond);

  return {
    total: countRow?.n ?? 0,
    items: rows.map((r) => ({
      job: rowToJob(r.job),
      firstSeenAt: r.job.firstSeenAt,
      match: r.match?.result ?? null,
      status: r.status ?? null,
    })),
  };
}

export async function getJobDetail(db: Db, id: string) {
  const [row] = await db
    .select({ job: jobs, match: matches, status: jobStatus })
    .from(jobs)
    .leftJoin(matches, eq(matches.jobId, jobs.id))
    .leftJoin(jobStatus, eq(jobStatus.jobId, jobs.id))
    .where(eq(jobs.id, id));
  if (!row) return null;
  return {
    job: rowToJob(row.job),
    row: row.job,
    match: row.match?.result ?? null,
    status: row.status ?? null,
  };
}

export async function listAllMatches(db: Db): Promise<MatchResult[]> {
  const rows = await db
    .select({ result: matches.result })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(eq(jobs.active, true));
  return rows.map((r) => r.result);
}

export async function setJobStatus(db: Db, jobId: string, status: JobStatus | null, note?: string | null) {
  if (!status) {
    await db.delete(jobStatus).where(eq(jobStatus.jobId, jobId));
    return;
  }
  await db
    .insert(jobStatus)
    .values({ jobId, status, note: note ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: jobStatus.jobId,
      set: { status, ...(note !== undefined ? { note } : {}), updatedAt: new Date() },
    });
}

export async function listPipeline(db: Db) {
  const rows = await db
    .select({ job: jobs, status: jobStatus, match: matches })
    .from(jobStatus)
    .innerJoin(jobs, eq(jobs.id, jobStatus.jobId))
    .leftJoin(matches, eq(matches.jobId, jobs.id))
    .orderBy(desc(jobStatus.updatedAt));
  return rows
    .filter((r) => r.status.status !== "hidden")
    .map((r) => ({ job: rowToJob(r.job), status: r.status, score: r.match?.score ?? null }));
}

export async function saveAnalysis(db: Db, jobId: string | null, kind: AnalysisKind, content: Record<string, unknown>, model: string) {
  const [row] = await db.insert(analyses).values({ jobId, kind, content, model }).returning();
  return row!;
}

export async function latestAnalysis(db: Db, jobId: string | null, kind: AnalysisKind) {
  const [row] = await db
    .select()
    .from(analyses)
    .where(and(jobId ? eq(analyses.jobId, jobId) : isNull(analyses.jobId), eq(analyses.kind, kind)))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listAnalyses(db: Db, kind: AnalysisKind, limit = 30) {
  return db
    .select({ a: analyses, title: jobs.title, company: jobs.company })
    .from(analyses)
    .leftJoin(jobs, eq(jobs.id, analyses.jobId))
    .where(eq(analyses.kind, kind))
    .orderBy(desc(analyses.createdAt))
    .limit(limit);
}

export async function analyzedJobIds(db: Db, ids: string[], kind: AnalysisKind): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .selectDistinct({ id: analyses.jobId })
    .from(analyses)
    .where(and(inArray(analyses.jobId, ids), eq(analyses.kind, kind)));
  return new Set(rows.map((r) => r.id!).filter(Boolean));
}

export async function dashboardCounts(db: Db, since: Date, now = new Date()) {
  // 시각 컬럼은 밀리초 정수이므로 비교값도 밀리초로 넘깁니다
  const nowMs = now.getTime();
  const soonMs = nowMs + 5 * 24 * 60 * 60 * 1000;
  const [r] = await db
    .select({
      active: sql<number>`count(*) filter (where ${jobs.active} = 1)`.mapWith(Number),
      newSince: sql<number>`count(*) filter (where ${jobs.active} = 1 and ${jobs.firstSeenAt} >= ${since.getTime()})`.mapWith(Number),
      closingSoon: sql<number>`count(*) filter (where ${jobs.active} = 1 and ${jobs.deadline} between ${nowMs} and ${soonMs})`.mapWith(Number),
    })
    .from(jobs);
  return r ?? { active: 0, newSince: 0, closingSoon: 0 };
}

export async function getAnalysis(db: Db, id: number) {
  const [row] = await db
    .select({ a: analyses, title: jobs.title, company: jobs.company })
    .from(analyses)
    .leftJoin(jobs, eq(jobs.id, analyses.jobId))
    .where(eq(analyses.id, id));
  return row ?? null;
}
