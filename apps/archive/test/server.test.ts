// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, parseRange } from "../server/app";
import { Store } from "../server/store";

const ORIGIN = "https://archiev.example.test";
const salt = randomBytes(16);
const cfg = {
  username: "owner",
  passwordHash: `scrypt$${salt.toString("hex")}$${scryptSync("correct horse", salt, 64).toString("hex")}`,
  sessionSecret: "test-secret",
  origin: ORIGIN,
  secureCookie: false,
  maxFileBytes: 1024,
  minFreeBytes: 0,
};

let dir: string;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archive-test-"));
  app = createApp(cfg, await new Store(dir).init());
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function login(username = "owner", password = "correct horse", ip = "1.1.1.1") {
  return app.request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip },
    body: JSON.stringify({ username, password }),
  });
}

async function cookie() {
  const res = await login();
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

const upload = (ck: string, body: BodyInit, type = "image/png", name = "사진.png") =>
  app.request("/api/items", {
    method: "POST",
    headers: { Cookie: ck, Origin: ORIGIN, "Content-Type": type, "X-File-Name": encodeURIComponent(name), "X-File-Modified": "1700000000000" },
    body,
  });

describe("login", () => {
  it("accepts the right id and password and sets an httpOnly cookie", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/archiev_session=.*HttpOnly/);
  });

  it("rejects a wrong id or password", async () => {
    expect((await login("owner", "nope")).status).toBe(401);
    expect((await login("other", "correct horse")).status).toBe(401);
  });

  it("locks an address after repeated failures but not after successes", async () => {
    for (let i = 0; i < 12; i++) expect((await login("owner", "correct horse", "2.2.2.2")).status).toBe(200);
    for (let i = 0; i < 8; i++) await login("owner", "nope", "3.3.3.3");
    expect((await login("owner", "correct horse", "3.3.3.3")).status).toBe(429);
  });

  it("refuses changes from another origin", async () => {
    const res = await app.request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.test" },
      body: JSON.stringify({ username: "owner", password: "correct horse" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("items", () => {
  it("requires a session", async () => {
    expect((await app.request("/api/items")).status).toBe(401);
    expect((await app.request("/files/AAAAAAAAAAAA")).status).toBe(401);
  });

  it("uploads, lists, serves ranges, saves a memo, and deletes", async () => {
    const ck = await cookie();
    const res = await upload(ck, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item).toMatchObject({ name: "사진.png", kind: "image", size: 10, takenAt: 1700000000000 });

    const list = await (await app.request("/api/items", { headers: { Cookie: ck } })).json();
    expect(list.items).toHaveLength(1);
    expect(list.used).toBe(10);

    const part = await app.request(`/files/${item.id}`, { headers: { Cookie: ck, Range: "bytes=2-4" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([3, 4, 5]);
    expect(part.headers.get("content-security-policy")).toContain("sandbox");

    const dl = await app.request(`/files/${item.id}?download=1`, { headers: { Cookie: ck } });
    expect(dl.headers.get("content-disposition")).toContain("attachment");

    const memo = await app.request(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { Cookie: ck, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ memo: " 제주 " }),
    });
    expect((await memo.json()).memo).toBe("제주");

    const del = await app.request(`/api/items/${item.id}`, { method: "DELETE", headers: { Cookie: ck, Origin: ORIGIN } });
    expect(del.status).toBe(200);
    expect((await app.request(`/files/${item.id}`, { headers: { Cookie: ck } })).status).toBe(404);
  });

  it("keeps the list after a restart", async () => {
    const ck = await cookie();
    await upload(ck, new Uint8Array([1]));
    const again = createApp(cfg, await new Store(dir).init());
    const list = await (await again.request("/api/items", { headers: { Cookie: ck } })).json();
    expect(list.items).toHaveLength(1);
  });

  it("accepts only images and videos, never SVG", async () => {
    const ck = await cookie();
    expect((await upload(ck, "<svg/>", "image/svg+xml")).status).toBe(415);
    expect((await upload(ck, "<html>", "text/html")).status).toBe(415);
    expect((await upload(ck, new Uint8Array([1]), "video/mp4", "a.mp4")).status).toBe(201);
  });

  it("rejects files over the limit without keeping a partial file", async () => {
    const ck = await cookie();
    expect((await upload(ck, new Uint8Array(2048))).status).toBe(413);
    const list = await (await app.request("/api/items", { headers: { Cookie: ck } })).json();
    expect(list.items).toHaveLength(0);
  });

  it("strips path characters from names", async () => {
    const ck = await cookie();
    const item = await (await upload(ck, new Uint8Array([1]), "image/png", "../../etc/passwd.png")).json();
    expect(item.name).toBe("....etcpasswd.png");
  });
});

describe("folders", () => {
  const sendJson = (ck: string, method: string, url: string, body?: unknown) =>
    app.request(url, { method, headers: { Cookie: ck, Origin: ORIGIN, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("creates folders, uploads into one, moves files, and keeps files when a folder is removed", async () => {
    const ck = await cookie();
    expect((await sendJson(ck, "POST", "/api/folders", { name: "  " })).status).toBe(400);
    const trip = await (await sendJson(ck, "POST", "/api/folders", { name: "제주 여행" })).json();
    expect((await sendJson(ck, "POST", "/api/folders", { name: "제주 여행" })).status).toBe(409);
    const food = await (await sendJson(ck, "POST", "/api/folders", { name: "음식" })).json();

    const inTrip = await (
      await app.request("/api/items", {
        method: "POST",
        headers: { Cookie: ck, Origin: ORIGIN, "Content-Type": "image/png", "X-Folder-Id": trip.id },
        body: new Uint8Array([1]),
      })
    ).json();
    expect(inTrip.folderId).toBe(trip.id);
    const loose = await (await upload(ck, new Uint8Array([2]))).json();
    expect(loose.folderId).toBeNull();

    const badFolder = await app.request("/api/items", {
      method: "POST",
      headers: { Cookie: ck, Origin: ORIGIN, "Content-Type": "image/png", "X-Folder-Id": "AAAAAAAAAAAA" },
      body: new Uint8Array([3]),
    });
    expect(badFolder.status).toBe(404);

    expect((await (await sendJson(ck, "POST", "/api/items/move", { ids: [inTrip.id, loose.id], folderId: food.id })).json()).moved).toBe(2);
    expect((await sendJson(ck, "POST", "/api/items/move", { ids: [loose.id], folderId: "AAAAAAAAAAAA" })).status).toBe(404);

    const renamed = await (await sendJson(ck, "PATCH", `/api/folders/${food.id}`, { name: "맛집" })).json();
    expect(renamed.name).toBe("맛집");

    expect((await sendJson(ck, "DELETE", `/api/folders/${food.id}`)).status).toBe(200);
    const list = await (await app.request("/api/items", { headers: { Cookie: ck } })).json();
    expect(list.folders.map((f: { name: string }) => f.name)).toEqual(["제주 여행"]);
    expect(list.items).toHaveLength(2);
    expect(list.items.every((i: { folderId: string | null }) => i.folderId === null)).toBe(true);
  });

  it("deletes several files at once", async () => {
    const ck = await cookie();
    const a = await (await upload(ck, new Uint8Array([1]))).json();
    const b = await (await upload(ck, new Uint8Array([2]))).json();
    expect((await (await sendJson(ck, "POST", "/api/items/delete", { ids: [a.id, b.id] })).json()).deleted).toBe(2);
    expect((await sendJson(ck, "POST", "/api/items/delete", { ids: ["../etc"] })).status).toBe(400);
  });
});

describe("parseRange", () => {
  it("handles open and suffix ranges", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=5-", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=0-99", 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=10-", 10)).toBe("invalid");
    expect(parseRange("items=0-1", 10)).toBe("invalid");
  });
});
