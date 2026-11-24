import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stages, tracks } from "../content/roadmap.mjs";
import { build } from "../scripts/build.mjs";

let out = "";
const read = (path: string) => readFileSync(join(out, path), "utf8");
const pages = () => ["index.html", ...stages.map((s) => `${s.slug}/index.html`)];

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "cs-build-"));
  await build(out);
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("content", () => {
  it("has unique stage slugs and unique item ids within each stage", () => {
    expect(new Set(stages.map((s) => s.slug)).size).toBe(stages.length);
    for (const s of stages) {
      for (const items of [s.concepts, s.practice]) expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    }
  });

  it("gives every stage what a learner needs", () => {
    for (const s of stages) {
      expect(s.weeks, s.slug).toBeGreaterThan(0);
      expect(s.outcomes.length, s.slug).toBeGreaterThan(0);
      expect(s.concepts.length, s.slug).toBeGreaterThan(0);
      expect(s.practice.length, s.slug).toBeGreaterThan(0);
      expect(s.questions.length, s.slug).toBeGreaterThan(0);
      expect(s.resources.filter((r) => r.main), `${s.slug}: 메인 자료는 하나`).toHaveLength(1);
    }
  });

  it("links resources only over https", () => {
    const all = [...stages.flatMap((s) => s.resources), ...tracks.flatMap((t) => t.resources)];
    for (const r of all) if (r.url) expect(r.url, r.title).toMatch(/^https:\/\//);
  });
});

describe("built site", () => {
  it("writes the home page, one page per stage, robots and sitemap", () => {
    for (const p of pages()) expect(existsSync(join(out, p)), p).toBe(true);
    expect(read("robots.txt")).toContain("Sitemap: https://cs.mlnl.site/sitemap.xml");
    expect(read("sitemap.xml").match(/<loc>/g)).toHaveLength(stages.length + 1);
  });

  it("has exactly one h1 on every page", () => {
    for (const p of pages()) expect(read(p).match(/<h1[\s>]/g), p).toHaveLength(1);
  });

  it("only links to pages and assets that exist", () => {
    for (const p of pages()) {
      for (const [, href] of read(p).matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
        const file = href.endsWith("/") ? `${href}index.html` : href;
        expect(existsSync(join(out, file)), `${p} → ${href}`).toBe(true);
      }
    }
  });

  it("names assets by content so they can be cached for a year", () => {
    const names = readdirSync(join(out, "assets"));
    expect(names).toEqual(expect.arrayContaining([expect.stringMatching(/^style\.[0-9a-f]{10}\.css$/), expect.stringMatching(/^app\.[0-9a-f]{10}\.js$/)]));
  });

  it("uses a different progress key for every checkbox", () => {
    const keys = pages().flatMap((p) => [...read(p).matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]));
    expect(keys.length).toBe(stages.reduce((n, s) => n + s.concepts.length + s.practice.length, 0));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("escapes text and turns backticks into code", () => {
    const html = read("url/index.html");
    expect(html).toContain("<code>&lt;script&gt;</code>");
    expect(html).not.toContain("<script> 태그");
  });

  it("links stages in order and back to the roadmap at the end", () => {
    expect(read(`${stages[0].slug}/index.html`)).toContain(`href="/${stages[1].slug}/"`);
    expect(read(`${stages.at(-1)!.slug}/index.html`)).toContain("로드맵으로 돌아가기");
  });
});
