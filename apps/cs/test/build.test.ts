import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parts, upcoming } from "../content/book.mjs";
import { build } from "../scripts/build.mjs";

let out = "";
let slugs: string[] = [];
const read = (path: string) => readFileSync(join(out, path), "utf8");
const pages = () => ["index.html", "terms/index.html", "notes/index.html", ...slugs.map((s) => `${s}/index.html`)];

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "cs-build-"));
  const data = await build(out);
  slugs = data.chapters.map((c: { slug: string }) => c.slug);
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("차례", () => {
  it("장 주소가 겹치지 않습니다", () => {
    const all = parts.flatMap((p) => p.chapters);
    expect(new Set(all).size).toBe(all.length);
  });

  it("쓴 장은 모두 만들고, 아직 안 쓴 장은 준비 중으로만 보입니다", () => {
    const all = parts.flatMap((p) => p.chapters);
    for (const slug of all) {
      const written = existsSync(join(__dirname, "..", "content", "chapters", `${slug}.md`));
      expect(written || slug in upcoming, slug).toBe(true);
      expect(slugs.includes(slug), slug).toBe(written);
    }
    expect(read("index.html").match(/class="row is-soon"/g)?.length ?? 0).toBe(all.length - slugs.length);
  });
});

describe("만든 사이트", () => {
  it("첫 화면, 장마다 한 쪽, 용어 사전, robots, sitemap을 씁니다", () => {
    for (const p of pages()) expect(existsSync(join(out, p)), p).toBe(true);
    expect(read("robots.txt")).toContain("Sitemap: https://cs.mlnl.site/sitemap.xml");
    expect(read("sitemap.xml").match(/<loc>/g)).toHaveLength(slugs.length + 2);
    expect(read("notes/index.html")).toContain('id="book-map"');
  });

  it("쪽마다 h1이 하나입니다", () => {
    for (const p of pages()) expect(read(p).match(/<h1[\s>]/g), p).toHaveLength(1);
  });

  it("있는 쪽과 파일로만 링크합니다", () => {
    for (const p of pages()) {
      for (const [, href] of read(p).matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
        const file = href.endsWith("/") ? `${href}index.html` : href;
        expect(existsSync(join(out, file)), `${p} → ${href}`).toBe(true);
      }
    }
  });

  it("같은 쪽 안의 #링크는 그 쪽의 id를 가리킵니다", () => {
    for (const p of pages()) {
      const html = read(p);
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) expect(ids.has(decodeURIComponent(id)), `${p} → #${id}`).toBe(true);
    }
  });

  it("그림을 넣어도 쪽 안의 id가 겹치지 않습니다", () => {
    for (const p of pages()) {
      const ids = [...read(p).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dup, p).toEqual([]);
    }
  });

  it("자원 파일 이름에 내용의 해시를 넣어 1년 동안 캐시할 수 있게 합니다", () => {
    const names = readdirSync(join(out, "assets"));
    expect(names).toEqual(
      expect.arrayContaining([expect.stringMatching(/^style\.[0-9a-f]{10}\.css$/), expect.stringMatching(/^app\.[0-9a-f]{10}\.js$/)]),
    );
  });

  it("체크와 문제의 저장 열쇠가 겹치지 않습니다", () => {
    const keys = slugs.flatMap((s) =>
      [...read(`${s}/index.html`).matchAll(/data-(?:key|quiz)="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of slugs) expect(read(`${s}/index.html`), s).toContain(`data-key="${s}:s:intro"`);
  });

  it("장마다 파트로 나누고, 파트마다 학습 완료 체크 하나와 목록의 링크 하나가 있습니다", () => {
    for (const s of slugs) {
      const html = read(`${s}/index.html`);
      const ids = [...html.matchAll(/<section class="part" id="part-([^"]+)" data-part="\1">/g)].map((m) => m[1]);
      expect(ids.length, s).toBeGreaterThan(3);
      const checks = [...html.matchAll(/data-key="([^"]+:s:[^"]+)"/g)].map((m) => m[1]);
      expect(checks, s).toEqual(ids.map((id) => `${s}:s:${id}`));
      const links = [...html.matchAll(/data-part-link="([^"]+)"/g)].map((m) => m[1]);
      expect(links, s).toEqual(ids);
      expect(html, s).not.toContain('id="part-더-읽을거리"');
    }
  });

  it("선택형 문제마다 정답이 하나입니다", () => {
    for (const s of slugs) {
      for (const quiz of read(`${s}/index.html`).split('<div class="quiz" ').slice(1)) {
        const options = quiz.split('class="quiz-explain"')[0];
        if (!options.includes('class="quiz-options"')) continue;
        expect(options.match(/data-correct/g), `${s}: ${quiz.slice(0, 60)}`).toHaveLength(1);
      }
    }
  });

  it("글자를 이스케이프하고 백틱을 코드로 바꿉니다", () => {
    const html = read("dns/index.html");
    expect(html).toContain("<code>&lt;link rel=&quot;dns-prefetch&quot;&gt;</code>");
    expect(html).not.toMatch(/<p>[^<]*<script/);
  });

  it("장을 차례대로 잇습니다", () => {
    expect(read(`${slugs[0]}/index.html`)).toContain(`href="/${slugs[1]}/"`);
    expect(read(`${slugs[1]}/index.html`)).toContain(`href="/${slugs[0]}/"`);
  });
});
