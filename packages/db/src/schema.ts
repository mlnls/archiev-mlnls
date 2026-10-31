import type { JobDescription, MatchResult, Profile } from "@archiev/core";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 시각은 UTC 밀리초 정수로 저장하고 Date로 읽습니다 */
const tsz = (name: string) => integer(name, { mode: "timestamp_ms" });
/** JSON은 TEXT 컬럼에 문자열로 저장합니다 */
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const bool = (name: string) => integer(name, { mode: "boolean" });
const serial = (name: string) => integer(name).primaryKey({ autoIncrement: true });
const now = () => new Date();

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    companyLogo: text("company_logo"),
    location: text("location"),
    categories: json<string[]>("categories").notNull().$defaultFn(() => []),
    techStacks: json<string[]>("tech_stacks").notNull().$defaultFn(() => []),
    minCareer: integer("min_career"),
    maxCareer: integer("max_career"),
    newcomer: bool("newcomer").notNull().default(false),
    employmentType: text("employment_type"),
    deadline: tsz("deadline"),
    alwaysOpen: bool("always_open").notNull().default(false),
    postedAt: tsz("posted_at"),
    salaryText: text("salary_text"),
    educationText: text("education_text"),
    tags: json<string[]>("tags").notNull().$defaultFn(() => []),
    description: json<JobDescription | null>("description"),
    detailFetchedAt: tsz("detail_fetched_at"),
    active: bool("active").notNull().default(true),
    firstSeenAt: tsz("first_seen_at").notNull().$defaultFn(now),
    lastSeenAt: tsz("last_seen_at").notNull().$defaultFn(now),
  },
  (t) => [index("jobs_active_idx").on(t.active), index("jobs_source_idx").on(t.source), index("jobs_first_seen_idx").on(t.firstSeenAt)],
);

export const matches = sqliteTable(
  "matches",
  {
    jobId: text("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    track: text("track"),
    excluded: bool("excluded").notNull().default(false),
    result: json<MatchResult>("result").notNull(),
    computedAt: tsz("computed_at").notNull().$defaultFn(now),
  },
  (t) => [index("matches_score_idx").on(t.score)],
);

export { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from "@archiev/core";
import type { JobStatus } from "@archiev/core";

export const jobStatus = sqliteTable("job_status", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status").$type<JobStatus>().notNull(),
  note: text("note"),
  updatedAt: tsz("updated_at").notNull().$defaultFn(now),
});

export type AnalysisKind = "jd" | "resume" | "study";

export const analyses = sqliteTable(
  "analyses",
  {
    id: serial("id"),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AnalysisKind>().notNull(),
    content: json<Record<string, unknown>>("content").notNull(),
    model: text("model"),
    createdAt: tsz("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("analyses_job_kind_idx").on(t.jobId, t.kind)],
);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  data: json<Profile>("data").notNull(),
  updatedAt: tsz("updated_at").notNull().$defaultFn(now),
});

export type ImportKind = "pdf" | "notion" | "figma" | "text";

/** 프로필 추출에 쓴 원문 (노션 공부 기록 등을 AI 분석 때 참고 자료로 재사용) */
export const profileImports = sqliteTable("profile_imports", {
  id: serial("id"),
  kind: text("kind").$type<ImportKind>().notNull(),
  label: text("label").notNull(),
  text: text("text").notNull(),
  createdAt: tsz("created_at").notNull().$defaultFn(now),
});

export interface BatchStats {
  sources: Record<string, { fetched: number; new: number; error?: string; durationMs: number }>;
  newJobs: number;
  totalActive: number;
  deactivated: number;
  scored: number;
  analyzed: number;
  topNew: { id: string; title: string; company: string; score: number }[];
}

export const batchRuns = sqliteTable("batch_runs", {
  id: serial("id"),
  trigger: text("trigger").notNull().default("schedule"),
  status: text("status").$type<"running" | "success" | "partial" | "failed">().notNull(),
  stats: json<BatchStats | null>("stats"),
  errors: json<string[]>("errors").notNull().$defaultFn(() => []),
  startedAt: tsz("started_at").notNull().$defaultFn(now),
  finishedAt: tsz("finished_at"),
});

export type JobRow = typeof jobs.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type BatchRunRow = typeof batchRuns.$inferSelect;

// ─────────────── 블로그 ───────────────

export const posts = sqliteTable(
  "posts",
  {
    id: serial("id"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    /** 원본 마크다운 */
    body: text("body").notNull(),
    tags: json<string[]>("tags").notNull().$defaultFn(() => []),
    coverImage: text("cover_image"),
    published: bool("published").notNull().default(false),
    publishedAt: tsz("published_at"),
    createdAt: tsz("created_at").notNull().$defaultFn(now),
    updatedAt: tsz("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("posts_published_idx").on(t.published, t.publishedAt)],
);

/** 댓글 작성자: 아이디/비밀번호만 받습니다 */
export const commentUsers = sqliteTable("comment_users", {
  id: serial("id"),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: tsz("created_at").notNull().$defaultFn(now),
});

export const comments = sqliteTable(
  "comments",
  {
    id: serial("id"),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => commentUsers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: tsz("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("comments_post_idx").on(t.postId, t.createdAt)],
);

// ─────────────── 이력서 생성 큐 ───────────────

export type ResumeJobStatus = "queued" | "running" | "done" | "failed";

/** 버튼을 누르면 쌓이고, Mac 워커가 가져가 Claude Code로 처리합니다 */
export const resumeJobs = sqliteTable(
  "resume_jobs",
  {
    id: serial("id"),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").$type<ResumeJobStatus>().notNull().default("queued"),
    content: json<Record<string, unknown> | null>("content"),
    figmaUrl: text("figma_url"),
    figmaError: text("figma_error"),
    error: text("error"),
    model: text("model"),
    createdAt: tsz("created_at").notNull().$defaultFn(now),
    startedAt: tsz("started_at"),
    finishedAt: tsz("finished_at"),
  },
  (t) => [index("resume_jobs_status_idx").on(t.status, t.createdAt), index("resume_jobs_job_idx").on(t.jobId)],
);

/** 키-값 설정 (워커 마지막 접속 시각 등) */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type PostRow = typeof posts.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type ResumeJobRow = typeof resumeJobs.$inferSelect;
