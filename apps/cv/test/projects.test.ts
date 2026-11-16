import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const site = new URL("../site/", import.meta.url);
const index = readFileSync(new URL("index.html", site), "utf8");
const slugs = readdirSync(new URL("projects/", site));
const read = (slug: string) => readFileSync(new URL(`projects/${slug}/index.html`, site), "utf8");

describe("project pages", () => {
  it("every project link on the CV opens an existing page, and every page is linked", () => {
    const linked = [...index.matchAll(/href="\/projects\/([\w-]+)\/"/g)].map((m) => m[1]);
    expect(new Set(linked)).toEqual(new Set(slugs));
  });

  it("is listed in the sitemap", () => {
    const sitemap = readFileSync(new URL("sitemap.xml", site), "utf8");
    for (const slug of slugs) expect(sitemap).toContain(`https://mlnl.site/projects/${slug}/`);
  });

  for (const slug of slugs) {
    describe(slug, () => {
      const html = read(slug);

      it("has one h1, a canonical URL, a way back and valid JSON-LD", () => {
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).toContain(`<link rel="canonical" href="https://mlnl.site/projects/${slug}/">`);
        expect(html).toContain('href="/"');
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

      it("does not publish a phone number or email", () => {
        expect(html).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
        expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      });
    });
  }
});
