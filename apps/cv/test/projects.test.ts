import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error 빌드 스크립트는 타입 없는 ESM 입니다
import { readNotes, render } from "../scripts/build-projects.mjs";
// @ts-expect-error 콘텐츠는 타입 없는 ESM 입니다
import { projects } from "../content/projects.mjs";

const site = new URL("../site/", import.meta.url);
const index = readFileSync(new URL("index.html", site), "utf8");
const slugs = readdirSync(new URL("projects/", site));
const read = (rel: string) => readFileSync(new URL(rel, site), "utf8");

/** projects/<slug>/index.html 과 그 아래 노트 페이지 */
const pages = slugs.flatMap((slug) => {
  const dir = new URL(`projects/${slug}/`, site);
  const notes = readdirSync(dir).filter((n) => statSync(new URL(n, dir)).isDirectory());
  return [
    { rel: `projects/${slug}/`, slug },
    ...notes.map((n) => ({ rel: `projects/${slug}/${n}/`, slug })),
  ];
});

describe("project pages", () => {
  it("every project link on the CV opens an existing page, and every page is linked", () => {
    const linked = [...index.matchAll(/href="\/projects\/([\w-]+)\/"/g)].map((m) => m[1]);
    expect(new Set(linked)).toEqual(new Set(slugs));
  });

  it("are generated from content/projects.mjs and up to date", () => {
    const out = render() as Record<string, string>;
    for (const [rel, html] of Object.entries(out)) expect(read(rel), rel).toBe(html);
    // 손으로 만든 페이지가 남아 있지 않은지
    expect(pages.map((p) => `${p.rel}index.html`).sort()).toEqual(Object.keys(out).filter((k) => k.endsWith("index.html")).sort());
  });

  it("has a written post for every note, and no post without a note", () => {
    for (const p of projects) {
      const bodies = readNotes(p.slug) as Record<string, string>;
      expect(Object.keys(bodies).sort(), p.slug).toEqual(p.notes.map((n: { id: string }) => n.id).sort());
      for (const [id, body] of Object.entries(bodies)) {
        expect(body.match(/^## /gm)?.length ?? 0, `${p.slug}/${id} 소제목`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("uses every image it ships", () => {
    const out = Object.values(render() as Record<string, string>).join("\n");
    for (const slug of slugs) {
      for (const f of readdirSync(new URL(`projects/${slug}/`, site)).filter((n) => n.endsWith(".webp"))) {
        expect(out, `projects/${slug}/${f}`).toContain(`src="/projects/${slug}/${f}"`);
      }
    }
  });

  it("are all listed in the sitemap", () => {
    const sitemap = read("sitemap.xml");
    for (const { rel } of pages) expect(sitemap).toContain(`https://mlnl.site/${rel}`);
  });

  for (const { rel, slug } of pages) {
    describe(rel, () => {
      const html = read(`${rel}index.html`);

      it("has one h1, a canonical URL, a way back and valid JSON-LD", () => {
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).toContain(`<link rel="canonical" href="https://mlnl.site/${rel}">`);
        expect(html).toMatch(rel === `projects/${slug}/` ? /href="\/"/ : new RegExp(`href="/projects/${slug}/"`));
        const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
        expect(JSON.parse(raw).author["@id"]).toBe("https://mlnl.site/#person");
      });

      it("shows images that exist, with alt text and a size", () => {
        for (const m of html.matchAll(/<img ([^>]*)>/g)) {
          const attrs = m[1];
          expect(attrs).toMatch(/alt="[^"]+"/);
          expect(attrs).toMatch(/width="\d+" height="\d+"/);
          const src = /src="\/(projects\/[^"]+)"/.exec(attrs)?.[1] ?? "";
          expect(existsSync(new URL(src, site))).toBe(true);
        }
      });

      it("links only to pages that exist", () => {
        for (const m of html.matchAll(/href="\/(projects\/[\w-]+\/(?:[\w-]+\/)?)"/g)) {
          expect(existsSync(new URL(`${m[1]}index.html`, site)), m[1]).toBe(true);
        }
      });

      it("does not publish a phone number or email", () => {
        expect(html).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
        expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      });
    });
  }
});
