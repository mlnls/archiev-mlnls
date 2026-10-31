import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { descriptionToText, normalizeProfile, ProfileSchema, type Profile } from "@archiev/core";
import {
  addComment,
  claimNextResume,
  createCommentUser,
  createPost,
  dashboardCounts,
  deleteComment,
  deletePost,
  enqueueResume,
  failResume,
  findCommentUser,
  finishResume,
  getComment,
  getDb,
  getJobDetail,
  getKv,
  getPostById,
  getPostBySlug,
  getProfile,
  getResume,
  JOB_STATUSES,
  latestBatchRuns,
  listAllPosts,
  listComments,
  listJobs,
  listPublishedPosts,
  listResumes,
  listTags,
  requeueStaleResumes,
  resumesForJob,
  saveProfile,
  saveResumeDraft,
  setJobStatus,
  setKv,
  updatePost,
  type JobStatus,
  type PostInput,
} from "@archiev/db";
import { rescoreAll, runBatch } from "@archiev/scraper";
import { createSession, hashPassword, RateLimiter, safeEqual, SESSION_MAX_AGE, sniffImage, verifyPassword, verifySession } from "./security";

export interface ApiConfig {
  sessionSecret: string;
  adminPasswordHash: string;
  workerToken: string;
  revalidateSecret: string;
  blogInternalUrl: string;
  allowedOrigins: string[];
  cookieDomain?: string;
  uploadDir: string;
  secureCookie: boolean;
}

export function configFromEnv(env = process.env): ApiConfig {
  return {
    sessionSecret: env.SESSION_SECRET ?? "",
    adminPasswordHash: env.ADMIN_PASSWORD_HASH ?? "",
    workerToken: env.WORKER_TOKEN ?? "",
    revalidateSecret: env.REVALIDATE_SECRET ?? "",
    blogInternalUrl: env.BLOG_INTERNAL_URL ?? "",
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    uploadDir: path.resolve(env.UPLOAD_DIR ?? ".data/uploads"),
    secureCookie: env.NODE_ENV === "production",
  };
}

const COOKIE = "mlnl_session";
const WORKER_SEEN = "worker_last_seen";
const WORKER_ONLINE_MS = 90_000;
const STALE_RUNNING_MS = 20 * 60_000;

const PostSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "주소는 글자, 숫자, 하이픈만 쓸 수 있습니다"),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(300).default(""),
  body: z.string().min(1).max(200_000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  coverImage: z.string().max(500).nullable().optional(),
  published: z.boolean().default(false),
});

const CommentCredentials = z.object({
  username: z.string().trim().min(2, "아이디는 2자 이상입니다").max(20).regex(/^[\p{L}\p{N}_-]+$/u, "아이디는 글자, 숫자, _, - 만 쓸 수 있습니다"),
  password: z.string().min(4, "비밀번호는 4자 이상입니다").max(100),
});
const CommentCreate = CommentCredentials.extend({ body: z.string().trim().min(1, "내용을 입력해 주세요").max(2000) });

const ResumeContent = z.record(z.string(), z.unknown());

function clientIp(c: Context): string {
  // Caddy가 넣어 주는 값입니다. 앞단 없이 직접 받는 포트는 외부에 열지 않습니다.
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** 첫 오류 메시지 하나만 돌려줍니다 */
function issue(e: z.ZodError) {
  return e.issues[0]?.message ?? "입력값을 확인해 주세요";
}

export function createApp(cfg: ApiConfig) {
  const app = new Hono();
  const loginLimit = new RateLimiter(8, 15 * 60_000);
  const commentLimit = new RateLimiter(20, 10 * 60_000);
  let batchRunning = false;

  const isAdmin = (c: Context) => verifySession(getCookie(c, COOKIE), cfg.sessionSecret);

  // 쿠키가 실리는 변경 요청은 우리 오리진에서 온 것만 받습니다 (CSRF)
  app.use("*", async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD" && !c.req.path.startsWith("/worker/")) {
      const origin = c.req.header("origin");
      if (origin && !cfg.allowedOrigins.includes(origin)) return c.json({ error: "허용되지 않은 출처입니다" }, 403);
    }
    await next();
    c.header("X-Content-Type-Options", "nosniff");
  });

  const requireAdmin: MiddlewareHandler = async (c, next) => {
    if (!isAdmin(c)) return c.json({ error: "로그인이 필요합니다" }, 401);
    await next();
  };

  const requireWorker: MiddlewareHandler = async (c, next) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!cfg.workerToken || !safeEqual(token, cfg.workerToken)) return c.json({ error: "인증 실패" }, 401);
    await setKv(await getDb(), WORKER_SEEN, String(Date.now()));
    await next();
  };

  /** 글이 바뀌면 블로그의 캐시를 비웁니다. 실패해도 저장은 유지되고 5분 뒤 반영됩니다 */
  const revalidateBlog = async () => {
    if (!cfg.blogInternalUrl || !cfg.revalidateSecret) return;
    try {
      await fetch(`${cfg.blogInternalUrl}/internal/revalidate`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.revalidateSecret}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      console.warn("blog revalidate failed:", (e as Error).message);
    }
  };

  app.get("/health", (c) => c.json({ ok: true }));

  // ─────────────── 관리자 로그인 ───────────────

  app.post("/auth/login", async (c) => {
    if (!loginLimit.allow(clientIp(c))) return c.json({ error: "잠시 후 다시 시도해 주세요" }, 429);
    const { password } = z.object({ password: z.string().max(200) }).parse(await c.req.json());
    if (!cfg.adminPasswordHash || !(await verifyPassword(password, cfg.adminPasswordHash))) {
      return c.json({ error: "비밀번호가 맞지 않습니다" }, 401);
    }
    setCookie(c, COOKIE, createSession(cfg.sessionSecret), {
      httpOnly: true,
      secure: cfg.secureCookie,
      sameSite: "Lax",
      path: "/",
      domain: cfg.cookieDomain,
      maxAge: SESSION_MAX_AGE,
    });
    return c.json({ ok: true });
  });

  app.post("/auth/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/", domain: cfg.cookieDomain });
    return c.json({ ok: true });
  });

  app.get("/auth/me", (c) => c.json({ admin: isAdmin(c) }));

  // ─────────────── 블로그 (공개) ───────────────

  app.get("/posts", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 1000);
    const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
    return c.json(await listPublishedPosts(await getDb(), { tag: c.req.query("tag"), limit, offset }));
  });

  app.get("/tags", async (c) => c.json(await listTags(await getDb())));

  app.get("/posts/:slug", async (c) => {
    const post = await getPostBySlug(await getDb(), c.req.param("slug"), { includeDraft: isAdmin(c) });
    return post ? c.json(post) : c.json({ error: "글이 없습니다" }, 404);
  });

  app.get("/posts/:slug/comments", async (c) => {
    const db = await getDb();
    const post = await getPostBySlug(db, c.req.param("slug"));
    if (!post) return c.json({ error: "글이 없습니다" }, 404);
    return c.json(await listComments(db, post.id));
  });

  /** 처음 쓰는 아이디는 그 비밀번호로 가입되고, 있는 아이디는 비밀번호가 맞아야 합니다 */
  app.post("/posts/:slug/comments", async (c) => {
    if (!commentLimit.allow(clientIp(c))) return c.json({ error: "잠시 후 다시 시도해 주세요" }, 429);
    const parsed = CommentCreate.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    const { username, password, body } = parsed.data;

    const db = await getDb();
    const post = await getPostBySlug(db, c.req.param("slug"));
    if (!post) return c.json({ error: "글이 없습니다" }, 404);

    let user = await findCommentUser(db, username);
    if (user) {
      if (!(await verifyPassword(password, user.passwordHash))) {
        return c.json({ error: "이미 있는 아이디입니다. 비밀번호를 확인해 주세요" }, 401);
      }
    } else {
      user = await createCommentUser(db, username, await hashPassword(password));
    }
    const comment = await addComment(db, post.id, user.id, body);
    return c.json({ id: comment.id, body: comment.body, createdAt: comment.createdAt, username }, 201);
  });

  /** 쓴 사람(아이디/비밀번호) 또는 관리자만 지울 수 있습니다 */
  app.delete("/comments/:id", async (c) => {
    if (!commentLimit.allow(clientIp(c))) return c.json({ error: "잠시 후 다시 시도해 주세요" }, 429);
    const db = await getDb();
    const id = Number(c.req.param("id"));
    const comment = Number.isInteger(id) ? await getComment(db, id) : null;
    if (!comment) return c.json({ error: "댓글이 없습니다" }, 404);
    if (!isAdmin(c)) {
      const parsed = CommentCredentials.safeParse(await c.req.json().catch(() => ({})));
      const ok = parsed.success && parsed.data.username === comment.username && (await verifyPassword(parsed.data.password, comment.passwordHash));
      if (!ok) return c.json({ error: "아이디 또는 비밀번호가 맞지 않습니다" }, 401);
    }
    await deleteComment(db, id);
    return c.json({ ok: true });
  });

  // ─────────────── 블로그 (관리자) ───────────────

  const admin = new Hono();
  admin.use("*", requireAdmin);

  admin.get("/posts", async (c) => c.json(await listAllPosts(await getDb())));

  admin.get("/posts/:id", async (c) => {
    const post = await getPostById(await getDb(), Number(c.req.param("id")));
    return post ? c.json(post) : c.json({ error: "글이 없습니다" }, 404);
  });

  const savePost = async (c: Context, write: (input: PostInput) => Promise<unknown>) => {
    const parsed = PostSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    try {
      const row = await write(parsed.data);
      if (!row) return c.json({ error: "글이 없습니다" }, 404);
      await revalidateBlog();
      return c.json(row);
    } catch (e) {
      const text = `${(e as Error).message} ${String((e as { cause?: unknown }).cause ?? "")}`;
      if (/UNIQUE/i.test(text)) return c.json({ error: "이미 쓰고 있는 주소입니다" }, 409);
      throw e;
    }
  };

  admin.post("/posts", async (c) => {
    const db = await getDb();
    return savePost(c, (input) => createPost(db, input));
  });

  admin.put("/posts/:id", async (c) => {
    const db = await getDb();
    const id = Number(c.req.param("id"));
    return savePost(c, (input) => updatePost(db, id, input));
  });

  admin.delete("/posts/:id", async (c) => {
    await deletePost(await getDb(), Number(c.req.param("id")));
    await revalidateBlog();
    return c.json({ ok: true });
  });

  admin.post("/uploads", async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) return c.json({ error: "파일이 없습니다" }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: "5MB 이하만 올릴 수 있습니다" }, 413);
    const buf = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(buf);
    if (!kind) return c.json({ error: "PNG, JPG, GIF, WebP만 올릴 수 있습니다" }, 415);
    await mkdir(cfg.uploadDir, { recursive: true });
    const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${kind.ext}`;
    await writeFile(path.join(cfg.uploadDir, name), buf);
    return c.json({ url: `/api/uploads/${name}` }, 201);
  });

  app.route("/admin", admin);

  app.get("/uploads/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[a-z0-9-]+\.(png|jpg|gif|webp)$/.test(name)) return c.notFound();
    try {
      const buf = await readFile(path.join(cfg.uploadDir, name));
      const kind = sniffImage(buf);
      return c.body(buf, 200, { "Content-Type": kind?.type ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" });
    } catch {
      return c.notFound();
    }
  });

  // ─────────────── 채용 (관리자 전용) ───────────────

  const employ = new Hono();
  employ.use("*", requireAdmin);

  employ.get("/jobs", async (c) => {
    const q = c.req.query();
    const status = q.status as JobStatus | "none" | "any" | undefined;
    const db = await getDb();
    const { items, total } = await listJobs(db, {
      q: q.q || undefined,
      track: (q.track as never) || undefined,
      source: q.source || undefined,
      minScore: q.minScore ? Number(q.minScore) : undefined,
      onlyNewSince: q.newOnly === "1" ? new Date(Date.now() - 24 * 3_600_000) : undefined,
      status: status || undefined,
      limit: Math.min(Number(q.limit ?? 40) || 40, 100),
      offset: Number(q.offset ?? 0) || 0,
    });
    return c.json({ total, items });
  });

  employ.get("/jobs/:id", async (c) => {
    const db = await getDb();
    const id = c.req.param("id");
    const detail = await getJobDetail(db, id);
    if (!detail) return c.json({ error: "공고가 없습니다" }, 404);
    return c.json({ job: detail.job, match: detail.match, status: detail.status?.status ?? null, resumes: await resumesForJob(db, id) });
  });

  employ.put("/jobs/:id/status", async (c) => {
    const parsed = z.object({ status: z.enum(JOB_STATUSES).nullable() }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    await setJobStatus(await getDb(), c.req.param("id"), parsed.data.status);
    return c.json({ ok: true });
  });

  /** 버튼: 이 공고에 맞춘 이력서를 만들어 달라고 큐에 넣습니다 */
  employ.post("/jobs/:id/resume", async (c) => {
    const db = await getDb();
    const id = c.req.param("id");
    if (!(await getJobDetail(db, id))) return c.json({ error: "공고가 없습니다" }, 404);
    return c.json(await enqueueResume(db, id), 202);
  });

  employ.get("/resumes", async (c) => c.json(await listResumes(await getDb())));

  employ.get("/resumes/:id", async (c) => {
    const row = await getResume(await getDb(), Number(c.req.param("id")));
    return row ? c.json(row) : c.json({ error: "이력서가 없습니다" }, 404);
  });

  employ.get("/status", async (c) => {
    const db = await getDb();
    const seen = Number((await getKv(db, WORKER_SEEN)) ?? 0);
    return c.json({
      worker: { online: Date.now() - seen < WORKER_ONLINE_MS, lastSeen: seen ? new Date(seen).toISOString() : null },
      batchRunning,
      runs: await latestBatchRuns(db, 14),
      counts: await dashboardCounts(db, new Date(Date.now() - 24 * 3_600_000)),
    });
  });

  employ.post("/batch/run", (c) => {
    if (!startBatch("manual")) return c.json({ error: "이미 수집 중입니다" }, 409);
    return c.json({ ok: true }, 202);
  });

  employ.get("/profile", async (c) => c.json(await getProfile(await getDb())));

  employ.put("/profile", async (c) => {
    const parsed = ProfileSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    const db = await getDb();
    const profile: Profile = normalizeProfile(parsed.data);
    await saveProfile(db, profile);
    await rescoreAll(db, profile);
    return c.json(profile);
  });

  app.route("/employ", employ);

  // ─────────────── Mac 워커 ───────────────

  const worker = new Hono();
  worker.use("*", requireWorker);

  /** 대기 작업을 하나 가져갑니다. 없으면 204. 폴링 자체가 생존 신호입니다 */
  worker.post("/claim", async (c) => {
    const db = await getDb();
    await requeueStaleResumes(db, new Date(Date.now() - STALE_RUNNING_MS));
    const claimed = await claimNextResume(db);
    if (!claimed) return c.body(null, 204);
    const detail = await getJobDetail(db, claimed.jobId);
    const profile = await getProfile(db);
    if (!detail || !profile) {
      await failResume(db, claimed.id, "공고 또는 프로필이 없습니다");
      return c.body(null, 204);
    }
    return c.json({
      id: claimed.id,
      job: { ...detail.job, descriptionText: descriptionToText(detail.job.description) },
      match: detail.match,
      profile,
    });
  });

  worker.post("/resumes/:id/draft", async (c) => {
    const parsed = z.object({ content: ResumeContent, model: z.string().nullable().optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    await saveResumeDraft(await getDb(), Number(c.req.param("id")), parsed.data.content, parsed.data.model ?? null);
    return c.json({ ok: true });
  });

  worker.post("/resumes/:id/finish", async (c) => {
    const parsed = z.object({ figmaUrl: z.string().url().nullable().optional(), figmaError: z.string().max(2000).nullable().optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: issue(parsed.error) }, 400);
    await finishResume(await getDb(), Number(c.req.param("id")), { url: parsed.data.figmaUrl, error: parsed.data.figmaError });
    return c.json({ ok: true });
  });

  worker.post("/resumes/:id/fail", async (c) => {
    const { error } = z.object({ error: z.string() }).parse(await c.req.json());
    await failResume(await getDb(), Number(c.req.param("id")), error);
    return c.json({ ok: true });
  });

  app.route("/worker", worker);

  app.onError((e, c) => {
    if (e instanceof z.ZodError) return c.json({ error: issue(e) }, 400);
    console.error(e);
    return c.json({ error: "서버 오류가 발생했습니다" }, 500);
  });

  function startBatch(trigger: "schedule" | "manual"): boolean {
    if (batchRunning) return false;
    batchRunning = true;
    runBatch({ trigger })
      .catch((e) => console.error("batch failed:", e))
      .finally(() => {
        batchRunning = false;
      });
    return true;
  }

  return { app, startBatch };
}
