import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");

describe("CV page", () => {
  it("has valid JSON-LD naming the person", () => {
    const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(JSON.parse(raw).mainEntity.name).toBe("오승민");
  });

  it("links to the blog", () => {
    expect(html).toContain('href="https://blog.mlnl.site"');
  });

  it("does not publish a phone number or email", () => {
    expect(html).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("has one h1 and an image alt", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<img [^>]*alt="[^"]+"/);
  });
});
