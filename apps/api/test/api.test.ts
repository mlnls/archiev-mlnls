import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, jobs, saveProfile } from "@archiev/db";
import profileJson from "../../../data/profile.example.json";
import { createApp, type ApiConfig } from "../src/app";
import { hashPassword } from "../src/security";

process.env.DB_FILE = "memory";

const ORIGIN = "https://blog.mlnl.site";
let cfg: ApiConfig;
let app: ReturnType<typeof createApp>["app"];
let cookie = "";
const uploadDir = mkdtempSync(path.join(tmpdir(), "archiev-"));

const send = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(url, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const post = { slug: "첫-글", title: "첫 글", summary: "요약", body: "# 안녕", tags: ["react"], published: true };

beforeAll(async () => {
  cfg = {
    sessionSecret: "test-secret",
    adminPasswordHash: await hashPassword("correct horse"),
    workerToken: "worker-token",
    revalidateSecret: "",
    blogInternalUrl: "",
    allowedOrigins: [ORIGIN],
    uploadDir,
    secureCookie: false,
  };
  app = createApp(cfg).app;
  const res = await send("POST", "/auth/login", { password: "correct horse" });
  cookie = res.headers.get("set-cookie")!.split(";")[0]!;
});

afterAll(async () => {
  await closeDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("auth", () => {
  it("rejects a wrong password", async () => {
    const saved = cookie;
    cookie = "";
    expect((await send("POST", "/auth/login", { password: "nope" })).status).toBe(401);
    cookie = saved;
  });

  it("blocks admin and employ routes without a session", async () => {
    const saved = cookie;
    cookie = "";
    expect((await send("GET", "/admin/posts")).status).toBe(401);
    expect((await send("GET", "/employ/jobs")).status).toBe(401);
    expect((await send("GET", "/employ/profile")).status).toBe(401);
    cookie = saved;
  });

  it("rejects state changes from another origin", async () => {
    const res = await send("POST", "/admin/posts", post, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("posts and comments", () => {
  beforeEach(async () => {
    const list = (await (await send("GET", "/admin/posts")).json()) as { id: number }[];
    for (const p of list) await send("DELETE", `/admin/posts/${p.id}`);
  });

  it("hides drafts from anonymous readers", async () => {
    await send("POST", "/admin/posts", { ...post, published: false });
    const saved = cookie;
    cookie = "";
    expect((await send("GET", `/posts/${encodeURIComponent(post.slug)}`)).status).toBe(404);
    const list = (await (await send("GET", "/posts")).json()) as { total: number };
    expect(list.total).toBe(0);
    cookie = saved;
  });

  it("rejects a duplicate slug", async () => {
    await send("POST", "/admin/posts", post);
    expect((await send("POST", "/admin/posts", post)).status).toBe(409);
  });

  it("keeps the first publish date when a post is edited", async () => {
    const created = (await (await send("POST", "/admin/posts", post)).json()) as { id: number; publishedAt: string };
    const edited = (await (await send("PUT", `/admin/posts/${created.id}`, { ...post, title: "고친 글" })).json()) as { title: string; publishedAt: string };
    expect(edited.title).toBe("고친 글");
    expect(edited.publishedAt).toBe(created.publishedAt);
  });

  it("filters by tag", async () => {
    await send("POST", "/admin/posts", post);
    const hit = (await (await send("GET", "/posts?tag=react")).json()) as { total: number };
    const miss = (await (await send("GET", "/posts?tag=vue")).json()) as { total: number };
    expect([hit.total, miss.total]).toEqual([1, 0]);
  });

  it("registers on first comment, verifies the password afterwards, and never returns hashes", async () => {
    await send("POST", "/admin/posts", post);
    const saved = cookie;
    cookie = "";
    const url = `/posts/${encodeURIComponent(post.slug)}/comments`;
    const username = `user${Date.now()}`;
    const first = await send("POST", url, { username, password: "pass1234", body: "좋은 글" });
    expect(first.status).toBe(201);
    expect((await send("POST", url, { username, password: "wrong-pass", body: "x" })).status).toBe(401);
    expect((await send("POST", url, { username, password: "pass1234", body: "또 씀" })).status).toBe(201);

    const raw = await (await send("GET", url)).text();
    expect(raw).not.toContain("scrypt");
    expect(raw).not.toContain("passwordHash");
    expect(JSON.parse(raw)).toHaveLength(2);

    const { id } = (await first.json()) as { id: number };
    expect((await send("DELETE", `/comments/${id}`, { username, password: "wrong-pass" })).status).toBe(401);
    expect((await send("DELETE", `/comments/${id}`, { username: "other", password: "pass1234" })).status).toBe(401);
    expect((await send("DELETE", `/comments/${id}`, { username, password: "pass1234" })).status).toBe(200);
    cookie = saved;
  });
});

describe("uploads", () => {
  const upload = (bytes: number[]) => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "a.bin"));
    return app.request("/admin/uploads", { method: "POST", headers: { cookie, origin: ORIGIN }, body: form });
  };

  it("accepts a real PNG and serves it", async () => {
    const res = await upload([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const got = await app.request(url.replace("/api", ""));
    expect(got.headers.get("content-type")).toBe("image/png");
  });

  it("rejects SVG and other content", async () => {
    const svg = [...new TextEncoder().encode("<svg onload=alert(1)>")];
    expect((await upload(svg)).status).toBe(415);
  });

  it("rejects path traversal", async () => {
    expect((await app.request("/uploads/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
  });
});

describe("resume queue", () => {
  const worker = { authorization: "Bearer worker-token" };
  const jobId = "wanted:1";

  beforeAll(async () => {
    const db = await getDb();
    await saveProfile(db, profileJson as never);
    await db.insert(jobs).values({ id: jobId, source: "wanted", externalId: "1", url: "https://example.com/1", title: "프론트엔드", company: "가나" });
  });

  it("rejects a worker without the token", async () => {
    expect((await send("POST", "/worker/claim", {})).status).toBe(401);
    expect((await send("POST", "/worker/claim", {}, { authorization: "Bearer nope" })).status).toBe(401);
  });

  it("runs the queue: enqueue twice → one job → draft → finish", async () => {
    const a = (await (await send("POST", `/employ/jobs/${jobId}/resume`)).json()) as { id: number; status: string };
    const b = (await (await send("POST", `/employ/jobs/${jobId}/resume`)).json()) as { id: number };
    expect(a.status).toBe("queued");
    expect(b.id).toBe(a.id);

    const claim = await send("POST", "/worker/claim", {}, worker);
    expect(claim.status).toBe(200);
    const claimed = (await claim.json()) as { id: number; job: { title: string }; profile: { name: string } };
    expect(claimed.id).toBe(a.id);
    expect(claimed.job.title).toBe("프론트엔드");
    expect((await send("POST", "/worker/claim", {}, worker)).status).toBe(204);

    await send("POST", `/worker/resumes/${a.id}/draft`, { content: { headline: "맞춤" }, model: "m" }, worker);
    await send("POST", `/worker/resumes/${a.id}/finish`, { figmaUrl: "https://www.figma.com/design/x", figmaError: null }, worker);

    const got = (await (await send("GET", `/employ/resumes/${a.id}`)).json()) as { resume: { status: string; content: unknown; figmaUrl: string } };
    expect(got.resume.status).toBe("done");
    expect(got.resume.content).toEqual({ headline: "맞춤" });
    expect(got.resume.figmaUrl).toContain("figma.com");
  });

  it("reports the worker online after it polls", async () => {
    const status = (await (await send("GET", "/employ/status")).json()) as { worker: { online: boolean } };
    expect(status.worker.online).toBe(true);
  });
});
