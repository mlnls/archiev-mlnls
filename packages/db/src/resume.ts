import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { jobs, kv, resumeJobs } from "./schema";

export async function enqueueResume(db: Db, jobId: string) {
  // 이미 대기·진행 중인 작업이 있으면 그것을 돌려줍니다 (버튼 두 번 눌러도 한 번만)
  const [open] = await db
    .select()
    .from(resumeJobs)
    .where(and(eq(resumeJobs.jobId, jobId), sql`${resumeJobs.status} in ('queued', 'running')`));
  if (open) return open;
  const [row] = await db.insert(resumeJobs).values({ jobId }).returning();
  return row!;
}

export async function listResumes(db: Db, limit = 50) {
  return db
    .select({
      id: resumeJobs.id,
      jobId: resumeJobs.jobId,
      status: resumeJobs.status,
      figmaUrl: resumeJobs.figmaUrl,
      error: resumeJobs.error,
      createdAt: resumeJobs.createdAt,
      finishedAt: resumeJobs.finishedAt,
      company: jobs.company,
      title: jobs.title,
    })
    .from(resumeJobs)
    .innerJoin(jobs, eq(jobs.id, resumeJobs.jobId))
    .orderBy(desc(resumeJobs.createdAt))
    .limit(limit);
}

export async function getResume(db: Db, id: number) {
  const [row] = await db
    .select({ resume: resumeJobs, company: jobs.company, title: jobs.title, url: jobs.url })
    .from(resumeJobs)
    .innerJoin(jobs, eq(jobs.id, resumeJobs.jobId))
    .where(eq(resumeJobs.id, id));
  return row ?? null;
}

export async function resumesForJob(db: Db, jobId: string) {
  return db.select().from(resumeJobs).where(eq(resumeJobs.jobId, jobId)).orderBy(desc(resumeJobs.createdAt));
}

/** 가장 오래된 대기 작업을 하나 가져갑니다. 조건부 UPDATE라 워커가 여럿이어도 한 곳만 성공합니다 */
export async function claimNextResume(db: Db, now = new Date()) {
  const [next] = await db.select({ id: resumeJobs.id }).from(resumeJobs).where(eq(resumeJobs.status, "queued")).orderBy(asc(resumeJobs.createdAt)).limit(1);
  if (!next) return null;
  const [row] = await db
    .update(resumeJobs)
    .set({ status: "running", startedAt: now, error: null })
    .where(and(eq(resumeJobs.id, next.id), eq(resumeJobs.status, "queued")))
    .returning();
  return row ?? null;
}

export async function saveResumeDraft(db: Db, id: number, content: Record<string, unknown>, model: string | null) {
  await db.update(resumeJobs).set({ content, model }).where(eq(resumeJobs.id, id));
}

export async function finishResume(db: Db, id: number, figma: { url?: string | null; error?: string | null }, now = new Date()) {
  await db
    .update(resumeJobs)
    .set({ status: "done", figmaUrl: figma.url ?? null, figmaError: figma.error ?? null, finishedAt: now })
    .where(eq(resumeJobs.id, id));
}

export async function failResume(db: Db, id: number, error: string, now = new Date()) {
  await db.update(resumeJobs).set({ status: "failed", error: error.slice(0, 2000), finishedAt: now }).where(eq(resumeJobs.id, id));
}

/** 워커가 죽어 오래 'running'에 머문 작업을 대기로 되돌립니다 */
export async function requeueStaleResumes(db: Db, olderThan: Date) {
  await db
    .update(resumeJobs)
    .set({ status: "queued", startedAt: null })
    .where(and(eq(resumeJobs.status, "running"), lt(resumeJobs.startedAt, olderThan)));
}

export async function setKv(db: Db, key: string, value: string) {
  await db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } });
}

export async function getKv(db: Db, key: string) {
  const [row] = await db.select().from(kv).where(eq(kv.key, key));
  return row?.value ?? null;
}
