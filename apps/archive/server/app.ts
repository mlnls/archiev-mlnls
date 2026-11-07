import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createSession, FailureLimiter, safeEqual, SESSION_MAX_AGE, verifyPassword, verifySession } from "./security";
import { ID_PATTERN, kindOf, type Item, type Store } from "./store";

export interface ArchiveConfig {
  username: string;
  passwordHash: string;
  sessionSecret: string;
  /** 변경 요청을 받을 오리진 (CSRF). 비우면 검사하지 않습니다 (로컬 개발) */
  origin: string;
  secureCookie: boolean;
  maxFileBytes: number;
  /** 디스크 여유가 이보다 적으면 업로드를 받지 않습니다 */
  minFreeBytes: number;
}

const COOKIE = "archiev_session";
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const GB = 1024 ** 3;

export const DEFAULTS = { maxFileBytes: 4 * GB, minFreeBytes: 3 * GB };

class TooLarge extends Error {}

function clientIp(c: Context): string {
  // Caddy가 넣어 주는 값입니다. 컨테이너 포트는 외부에 열지 않습니다.
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** 요청 본문을 크기 제한을 걸어 파일로 흘려 씁니다. 메모리에 다 올리지 않습니다 */
async function saveBody(body: ReadableStream<Uint8Array> | null, dest: string, limit: number): Promise<number> {
  if (!body) throw new Error("본문이 없습니다");
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb(size > limit ? new TooLarge() : null, chunk);
    },
  });
  const tmp = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), counter, createWriteStream(tmp));
    await rename(tmp, dest);
    return size;
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/** "bytes=0-99" 형태 하나만 지원합니다. 동영상 탐색에 필요합니다 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

const contentDisposition = (kind: "inline" | "attachment", name: string) =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(name)}`;

export function createApp(cfg: ArchiveConfig, store: Store) {
  const app = new Hono();
  const limiter = new FailureLimiter(8, 15 * 60_000);
  const isAuthed = (c: Context) => verifySession(getCookie(c, COOKIE), cfg.sessionSecret);

  app.use("*", async (c, next) => {
    const method = c.req.method;
    if (cfg.origin && method !== "GET" && method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && origin !== cfg.origin) return c.json({ error: "허용되지 않은 출처입니다" }, 403);
    }
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Frame-Options", "DENY");
  });

  const requireAuth: MiddlewareHandler = async (c, next) => {
    if (!isAuthed(c)) return c.json({ error: "로그인이 필요합니다" }, 401);
    await next();
  };

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/me", (c) => c.json({ authed: isAuthed(c) }));

  app.post("/api/login", async (c) => {
    const ip = clientIp(c);
    if (limiter.blocked(ip)) return c.json({ error: "로그인 시도가 많습니다. 15분 뒤에 다시 시도해 주세요" }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    // 아이디가 틀려도 비밀번호 검사를 똑같이 해서 응답 시간으로 구분되지 않게 합니다
    const pwOk = password.length > 0 && password.length <= 200 && (await verifyPassword(password, cfg.passwordHash));
    if (!(safeEqual(username, cfg.username) && pwOk)) {
      limiter.fail(ip);
      return c.json({ error: "아이디 또는 비밀번호가 맞지 않습니다" }, 401);
    }
    limiter.clear(ip);
    setCookie(c, COOKIE, createSession(cfg.sessionSecret), {
      httpOnly: true,
      secure: cfg.secureCookie,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.use("/api/items/*", requireAuth);
  app.use("/api/items", requireAuth);
  app.use("/files/*", requireAuth);

  app.use("/api/folders/*", requireAuth);
  app.use("/api/folders", requireAuth);

  app.get("/api/items", async (c) => {
    const items = store.list();
    const used = items.reduce((s, i) => s + i.size, 0);
    return c.json({ items, folders: store.listFolders(), used, free: await store.freeBytes() });
  });

  const folderName = (v: unknown) => {
    const name = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
    return name && name.length <= 60 ? name : null;
  };

  app.post("/api/folders", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = folderName(body.name);
    if (!name) return c.json({ error: "폴더 이름은 1~60자로 적어 주세요" }, 400);
    if (store.listFolders().some((f) => f.name === name)) return c.json({ error: "같은 이름의 폴더가 있습니다" }, 409);
    return c.json(await store.addFolder(name), 201);
  });

  app.patch("/api/folders/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID_PATTERN.test(id) || !store.getFolder(id)) return c.json({ error: "없는 폴더입니다" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = folderName(body.name);
    if (!name) return c.json({ error: "폴더 이름은 1~60자로 적어 주세요" }, 400);
    if (store.listFolders().some((f) => f.name === name && f.id !== id)) return c.json({ error: "같은 이름의 폴더가 있습니다" }, 409);
    return c.json(await store.renameFolder(id, name));
  });

  app.delete("/api/folders/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID_PATTERN.test(id)) return c.json({ error: "없는 폴더입니다" }, 404);
    return (await store.removeFolder(id)) ? c.json({ ok: true }) : c.json({ error: "없는 폴더입니다" }, 404);
  });

  const idList = (v: unknown) =>
    Array.isArray(v) && v.length > 0 && v.length <= 1000 && v.every((x) => typeof x === "string" && ID_PATTERN.test(x)) ? (v as string[]) : null;

  app.post("/api/items/move", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown; folderId?: unknown };
    const ids = idList(body.ids);
    if (!ids) return c.json({ error: "옮길 파일을 골라 주세요" }, 400);
    const folderId = body.folderId === null ? null : typeof body.folderId === "string" ? body.folderId : undefined;
    if (folderId === undefined || (folderId !== null && !store.getFolder(folderId))) return c.json({ error: "없는 폴더입니다" }, 404);
    return c.json({ moved: await store.move(ids, folderId) });
  });

  app.post("/api/items/delete", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = idList(body.ids);
    if (!ids) return c.json({ error: "지울 파일을 골라 주세요" }, 400);
    let deleted = 0;
    for (const id of ids) if (await store.remove(id)) deleted++;
    return c.json({ deleted });
  });

  // 본문은 파일 그대로, 이름과 시각은 헤더로 받습니다 (multipart 없이 바로 디스크에 씁니다)
  app.post("/api/items", async (c) => {
    const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const kind = kindOf(type);
    if (!kind) return c.json({ error: "사진과 동영상만 올릴 수 있습니다" }, 415);
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > cfg.maxFileBytes) return c.json({ error: "파일이 너무 큽니다" }, 413);
    if ((await store.freeBytes()) - declared < cfg.minFreeBytes) return c.json({ error: "서버 저장 공간이 부족합니다" }, 507);

    let name = "";
    try {
      name = decodeURIComponent(c.req.header("x-file-name") ?? "");
    } catch {
      /* 잘못된 인코딩이면 기본 이름을 씁니다 */
    }
    name = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 200) || "이름 없음";
    const now = Date.now();
    const modified = Number(c.req.header("x-file-modified"));
    const takenAt = Number.isFinite(modified) && modified > 0 && modified <= now + 86_400_000 ? modified : now;

    const folderHeader = c.req.header("x-folder-id") || null;
    if (folderHeader && !(ID_PATTERN.test(folderHeader) && store.getFolder(folderHeader))) return c.json({ error: "없는 폴더입니다" }, 404);

    const id = store.newId();
    let size: number;
    try {
      size = await saveBody(c.req.raw.body, store.filePath(id), cfg.maxFileBytes);
    } catch (e) {
      if (e instanceof TooLarge) return c.json({ error: "파일이 너무 큽니다" }, 413);
      throw e;
    }
    if (size === 0) {
      await rm(store.filePath(id), { force: true });
      return c.json({ error: "빈 파일입니다" }, 400);
    }
    const item: Item = { id, name, type, kind, size, takenAt, uploadedAt: now, memo: "", thumb: false, folderId: folderHeader };
    await store.add(item);
    return c.json(item, 201);
  });

  /** 미리보기는 브라우저가 만들어 JPEG로 올립니다. 서버에 이미지 라이브러리를 두지 않기 위해서입니다 */
  app.put("/api/items/:id/thumb", async (c) => {
    const id = c.req.param("id");
    if (!ID_PATTERN.test(id) || !store.get(id)) return c.json({ error: "없는 파일입니다" }, 404);
    if (c.req.header("content-type") !== "image/jpeg") return c.json({ error: "JPEG만 받습니다" }, 415);
    try {
      await saveBody(c.req.raw.body, store.thumbPath(id), MAX_THUMB_BYTES);
    } catch (e) {
      if (e instanceof TooLarge) return c.json({ error: "미리보기가 너무 큽니다" }, 413);
      throw e;
    }
    const dim = (h: string) => {
      const n = Number(c.req.header(h));
      return Number.isInteger(n) && n > 0 && n < 100_000 ? n : undefined;
    };
    return c.json(await store.update(id, { thumb: true, width: dim("x-width"), height: dim("x-height") }));
  });

  app.patch("/api/items/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID_PATTERN.test(id) || !store.get(id)) return c.json({ error: "없는 파일입니다" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { memo?: unknown };
    if (typeof body.memo !== "string" || body.memo.length > 2000) return c.json({ error: "메모는 2000자까지 쓸 수 있습니다" }, 400);
    return c.json(await store.update(id, { memo: body.memo.trim() }));
  });

  app.delete("/api/items/:id", async (c) => {
    const id = c.req.param("id");
    if (!ID_PATTERN.test(id)) return c.json({ error: "없는 파일입니다" }, 404);
    return (await store.remove(id)) ? c.json({ ok: true }) : c.json({ error: "없는 파일입니다" }, 404);
  });

  const sendFile = async (c: Context, file: string, type: string, name: string | null) => {
    const { size } = await stat(file);
    const range = parseRange(c.req.header("range"), size);
    const headers: Record<string, string> = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      // 파일 주소는 바뀌지 않으므로 브라우저에 오래 둡니다. 로그인한 사람의 브라우저에만 남습니다
      "Cache-Control": "private, max-age=31536000, immutable",
      // 업로드된 파일이 문서처럼 실행되지 않게 막습니다
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": contentDisposition(c.req.query("download") ? "attachment" : "inline", name ?? "preview.jpg"),
    };
    if (range === "invalid") return c.body(null, 416, { ...headers, "Content-Range": `bytes */${size}` });
    const { start, end } = range ?? { start: 0, end: size - 1 };
    headers["Content-Length"] = String(end - start + 1);
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    if (c.req.method === "HEAD") return c.body(null, range ? 206 : 200, headers);
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return c.body(stream, range ? 206 : 200, headers);
  };

  app.get("/files/:id/thumb", async (c) => {
    const id = c.req.param("id");
    const item = ID_PATTERN.test(id) ? store.get(id) : undefined;
    if (!item?.thumb) return c.json({ error: "없는 파일입니다" }, 404);
    return sendFile(c, store.thumbPath(id), "image/jpeg", null);
  });

  app.get("/files/:id", async (c) => {
    const id = c.req.param("id");
    const item = ID_PATTERN.test(id) ? store.get(id) : undefined;
    if (!item) return c.json({ error: "없는 파일입니다" }, 404);
    return sendFile(c, store.filePath(id), item.type, item.name);
  });

  return app;
}
