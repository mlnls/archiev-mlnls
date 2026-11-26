// cs.<도메인>/api: 컴퓨터 기초 책의 계정과 학습 기록(진행, 푼 문제, 메모, 마지막으로 본 파트)을 저장합니다.
// 의존성 없이 Node 기본 기능(node:http, node:sqlite, node:crypto)만 씁니다. 앞의 Caddy가 /api/*를 이리로 보냅니다.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** 저장하는 기록의 종류. 브라우저의 localStorage 이름과 짝이 맞습니다 */
export const KINDS = ["progress", "quiz", "notes", "last"];
export const LIMITS = { body: 256 * 1024, value: 50 * 1024, entries: 5000, changes: 1000 };
const COOKIE = "cs_session";
const SESSION_DAYS = 30;
const USERNAME = /^[a-z0-9_\-가-힣]{2,20}$/;

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind, key)
    );
  `);
  return db;
}

/** 비밀번호는 scrypt + 사용자마다 다른 솔트로 저장합니다 (23장) */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** IP나 사용자마다 정해진 시간 창에 몇 번까지 */
export class RateLimiter {
  #hits = new Map();
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key, now = Date.now()) {
    if (this.#hits.size > 10_000) this.#hits.clear();
    const cur = this.#hits.get(key);
    if (!cur || cur.reset < now) {
      this.#hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    cur.n++;
    return cur.n <= this.max;
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{ db: DatabaseSync, secret: string, origins: string[], secureCookie?: boolean, now?: () => number }} opts
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createApp({ db, secret, origins, secureCookie = true, now = () => Date.now() }) {
  if (!secret) throw new Error("SESSION_SECRET이 필요합니다");
  // 블로그 API와 같은 비밀 값을 쓰더라도 cs 전용 열쇠로 갈라 씁니다
  const key = createHmac("sha256", secret).update("mlnl-cs-session").digest();
  const sign = (s) => createHmac("sha256", key).update(s).digest("base64url");
  const loginLimit = new RateLimiter(10, 15 * 60_000);
  const writeLimit = new RateLimiter(600, 60_000);
  const q = {
    userByName: db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?"),
    userById: db.prepare("SELECT id, username FROM users WHERE id = ?"),
    insertUser: db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"),
    entries: db.prepare("SELECT kind, key, value FROM entries WHERE user_id = ?"),
    count: db.prepare("SELECT COUNT(*) AS n FROM entries WHERE user_id = ?"),
    upsert: db.prepare(
      "INSERT INTO entries (user_id, kind, key, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, kind, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ),
    remove: db.prepare("DELETE FROM entries WHERE user_id = ? AND kind = ? AND key = ?"),
    clear: db.prepare("DELETE FROM entries WHERE user_id = ? AND kind = ?"),
  };

  const cookieOf = (req) => /(?:^|;\s*)cs_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const setCookie = (res, value, maxAge) =>
    res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/api; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`);
  const session = (uid) => {
    const exp = Math.floor(now() / 1000) + SESSION_DAYS * 86_400;
    return `${uid}.${exp}.${sign(`${uid}.${exp}`)}`;
  };
  const userOf = (req) => {
    const [uid, exp, sig] = (cookieOf(req) ?? "").split(".");
    if (!uid || !exp || !sig || Number(exp) * 1000 < now()) return null;
    const want = Buffer.from(sign(`${uid}.${exp}`));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return q.userById.get(Number(uid)) ?? null;
  };
  const ipOf = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "local";

  async function body(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > LIMITS.body) throw new HttpError(413, "보내는 내용이 너무 큽니다");
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      throw new HttpError(400, "JSON 형식이 아닙니다");
    }
  }

  async function login(req, res) {
    if (!loginLimit.allow(ipOf(req), now())) throw new HttpError(429, "잠시 후 다시 시도해 주세요");
    const { username, password } = await body(req);
    const name = String(username ?? "").trim().toLowerCase();
    if (!USERNAME.test(name)) throw new HttpError(400, "아이디는 2~20자의 한글, 영문 소문자, 숫자, -, _로 정해 주세요");
    if (typeof password !== "string" || password.length < 8 || password.length > 200) throw new HttpError(400, "비밀번호는 8자 이상으로 정해 주세요");
    let user = q.userByName.get(name);
    let created = false;
    if (user) {
      if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(401, "이미 있는 아이디입니다. 비밀번호를 확인해 주세요");
    } else {
      try {
        const r = q.insertUser.run(name, await hashPassword(password), now());
        user = { id: Number(r.lastInsertRowid), username: name };
        created = true;
      } catch {
        // 같은 아이디로 동시에 가입하면 UNIQUE 제약이 막습니다 (22장)
        throw new HttpError(409, "방금 같은 아이디가 만들어졌습니다. 다시 시도해 주세요");
      }
    }
    setCookie(res, session(user.id), SESSION_DAYS * 86_400);
    return { username: user.username, created };
  }

  function state(user) {
    const out = Object.fromEntries(KINDS.map((k) => [k, {}]));
    for (const row of q.entries.all(user.id)) if (out[row.kind]) out[row.kind][row.key] = JSON.parse(row.value);
    return out;
  }

  async function save(req, user) {
    if (!writeLimit.allow(String(user.id), now())) throw new HttpError(429, "잠시 후 다시 시도해 주세요");
    const { changes } = await body(req);
    if (!Array.isArray(changes) || changes.length > LIMITS.changes) throw new HttpError(400, "changes 배열이 필요합니다");
    for (const c of changes) {
      if (!KINDS.includes(c?.kind)) throw new HttpError(400, "알 수 없는 기록 종류입니다");
      if (typeof c.key !== "string" || !c.key || c.key.length > 200) throw new HttpError(400, "기록의 열쇠가 잘못되었습니다");
      if (c.value != null && JSON.stringify(c.value).length > LIMITS.value) throw new HttpError(413, "기록 하나가 너무 큽니다");
    }
    db.exec("BEGIN");
    try {
      const t = now();
      for (const c of changes) {
        if (c.value == null) {
          // "*"는 그 종류의 기록을 모두 지웁니다 (진행 기록 지우기, 다시 풀기)
          if (c.key === "*") q.clear.run(user.id, c.kind);
          else q.remove.run(user.id, c.kind, c.key);
        } else q.upsert.run(user.id, c.kind, c.key, JSON.stringify(c.value), t);
      }
      if (q.count.get(user.id).n > LIMITS.entries) throw new HttpError(413, "저장할 수 있는 기록 수를 넘었습니다");
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true };
  }

  return async function handle(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      const method = req.method ?? "GET";
      // 쿠키가 실리는 변경 요청은 이 책의 출처에서 온 것만 받습니다 (23장의 CSRF)
      if (method !== "GET" && req.headers.origin && !origins.includes(req.headers.origin)) throw new HttpError(403, "허용되지 않은 출처입니다");
      let result;
      if (method === "GET" && path === "/api/health") result = { ok: true };
      else if (method === "POST" && path === "/api/login") result = await login(req, res);
      else if (method === "POST" && path === "/api/logout") {
        setCookie(res, "", 0);
        result = { ok: true };
      } else {
        const user = userOf(req);
        if (!user) throw new HttpError(401, "로그인이 필요합니다");
        if (method === "GET" && path === "/api/me") result = { username: user.username };
        else if (method === "GET" && path === "/api/state") result = state(user);
        else if (method === "POST" && path === "/api/state") result = await save(req, user);
        else throw new HttpError(404, "없는 주소입니다");
      }
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.statusCode = status;
      res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : "서버에서 문제가 생겼습니다" }));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb(process.env.DB_FILE ?? "/data/cs.db");
  const app = createApp({
    db,
    secret: process.env.SESSION_SECRET ?? "",
    origins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    secureCookie: process.env.COOKIE_SECURE !== "0",
  });
  const server = createServer(app).listen(Number(process.env.PORT ?? 4100), () => console.log(`cs-api: ${server.address().port}`));
  // 배포 때 SIGTERM을 받으면 받던 요청을 마치고 끝냅니다 (6장)
  process.on("SIGTERM", () => server.close(() => (db.close(), process.exit(0))));
}
