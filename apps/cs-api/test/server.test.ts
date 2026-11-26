// 계정 만들기, 로그인, 기록 저장과 불러오기, 막아야 할 요청을 확인합니다.
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, LIMITS, openDb } from "../src/server.mjs";

const ORIGIN = "https://cs.mlnl.cloud";
let server: Server;
let base = "";

beforeEach(async () => {
  const app = createApp({ db: openDb(":memory:"), secret: "test-secret", origins: [ORIGIN], secureCookie: false });
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const post = (path: string, body: unknown, cookie = "", origin = ORIGIN) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify(body) });
const get = (path: string, cookie = "") => fetch(base + path, { headers: { cookie } });
const cookieOf = (r: Response) => r.headers.get("set-cookie")!.split(";")[0]!;

describe("cs API", () => {
  it("처음 쓰는 아이디는 만들고, 같은 아이디는 비밀번호가 맞아야 들어옵니다", async () => {
    const first = await post("/api/login", { username: "Minsu", password: "password1" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ username: "minsu", created: true });
    expect(first.headers.get("set-cookie")).toMatch(/cs_session=.+; Path=\/api; Max-Age=\d+; HttpOnly; SameSite=Lax/);
    expect((await post("/api/login", { username: "minsu", password: "wrong-pass" })).status).toBe(401);
    const again = await post("/api/login", { username: "minsu", password: "password1" });
    expect(await again.json()).toEqual({ username: "minsu", created: false });
    expect(await (await get("/api/me", cookieOf(again))).json()).toEqual({ username: "minsu" });
  });

  it("기록을 바꾸고 지우고, 종류 하나를 통째로 지웁니다", async () => {
    const c = cookieOf(await post("/api/login", { username: "jieun", password: "password1" }));
    const changes = [
      { kind: "progress", key: "io:s:intro", value: 1 },
      { kind: "progress", key: "io:s:권한", value: 1 },
      { kind: "quiz", key: "io:q:mv-fast", value: { pick: 2, ok: true } },
      { kind: "notes", key: "io:intro", value: "<p>메모</p>" },
      { kind: "last", key: "io", value: "intro" },
    ];
    expect((await post("/api/state", { changes }, c)).status).toBe(200);
    await post("/api/state", { changes: [{ kind: "progress", key: "io:s:권한", value: null }] }, c);
    expect(await (await get("/api/state", c)).json()).toEqual({
      progress: { "io:s:intro": 1 },
      quiz: { "io:q:mv-fast": { pick: 2, ok: true } },
      notes: { "io:intro": "<p>메모</p>" },
      last: { io: "intro" },
    });
    await post("/api/state", { changes: [{ kind: "quiz", key: "*", value: null }] }, c);
    expect((await (await get("/api/state", c)).json()).quiz).toEqual({});
  });

  it("다른 사람의 기록은 보이지 않고, 로그인 없이는 읽고 쓸 수 없습니다", async () => {
    const a = cookieOf(await post("/api/login", { username: "aaa", password: "password1" }));
    const b = cookieOf(await post("/api/login", { username: "bbb", password: "password1" }));
    await post("/api/state", { changes: [{ kind: "notes", key: "io:intro", value: "a의 메모" }] }, a);
    expect((await (await get("/api/state", b)).json()).notes).toEqual({});
    expect((await get("/api/state")).status).toBe(401);
    expect((await post("/api/state", { changes: [] })).status).toBe(401);
    const forged = a.replace(/\.(\d+)\./, (_, exp) => `.${Number(exp) + 999}.`);
    expect((await get("/api/me", forged)).status).toBe(401);
  });

  it("다른 출처의 변경 요청, 잘못된 기록, 너무 큰 기록을 막습니다", async () => {
    expect((await post("/api/login", { username: "ccc", password: "password1" }, "", "https://evil.example")).status).toBe(403);
    const c = cookieOf(await post("/api/login", { username: "ccc", password: "password1" }));
    expect((await post("/api/state", { changes: [{ kind: "cookies", key: "x", value: 1 }] }, c)).status).toBe(400);
    expect((await post("/api/state", { changes: [{ kind: "notes", key: "x", value: "가".repeat(LIMITS.value) }] }, c)).status).toBe(413);
    expect((await post("/api/login", { username: "a", password: "password1" })).status).toBe(400);
    expect((await post("/api/login", { username: "ddd", password: "short" })).status).toBe(400);
  });

  it("같은 IP의 로그인 시도는 15분에 10번까지입니다", async () => {
    const tries = [];
    for (let i = 0; i < 11; i++) tries.push((await post("/api/login", { username: "eee", password: `wrong-${i}-pass` })).status);
    expect(tries.slice(0, 1)).toEqual([200]);
    expect(tries.at(-1)).toBe(429);
  });
});
