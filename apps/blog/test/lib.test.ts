import { describe, expect, it } from "vitest";
import { formatShortDate, slugify } from "@/lib/client";
import { postGraph, serializeJsonLd } from "@/lib/jsonld";
import { extractHeadings, firstImage, plainText, renderMarkdown } from "@/lib/markdown";
import type { Post } from "@/lib/types";

const post: Post = {
  id: 1,
  slug: "성능-개선",
  title: "성능 개선기",
  summary: "번들을 줄인 이야기",
  body: "# 제목\n\n본문 ![그림](/api/uploads/a.png)",
  tags: ["react", "성능"],
  coverImage: null,
  published: true,
  publishedAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

describe("renderMarkdown", () => {
  it("renders GFM tables and task lists", async () => {
    const html = await renderMarkdown("| a |\n| - |\n| b |\n\n- [x] 끝");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
  });

  it.each([
    ["<script>alert(1)</script>", "<script"],
    ['<img src=x onerror="alert(1)">', "onerror"],
    ["[x](javascript:alert(1))", "javascript:"],
    ['<iframe src="https://evil.example"></iframe>', "<iframe"],
  ])("strips dangerous markup: %s", async (source, banned) => {
    expect(await renderMarkdown(source)).not.toContain(banned);
  });

  it("gives headings ids and highlights code", async () => {
    const html = await renderMarkdown("## 렌더링 구조\n\n```ts\nconst a = 1;\n```");
    expect(html).toContain('<h2 id="렌더링-구조">');
    expect(html).toContain("hljs");
  });
});

describe("extractHeadings", () => {
  it("reads h2 and h3 from rendered html", async () => {
    const html = await renderMarkdown("# 제외\n\n## 둘째\n\n### 셋째 `코드`");
    expect(extractHeadings(html)).toEqual([
      { level: 2, id: "둘째", text: "둘째" },
      { level: 3, id: "셋째-코드", text: "셋째 코드" },
    ]);
  });
});

describe("plainText / firstImage", () => {
  it("strips markdown syntax and truncates", () => {
    expect(plainText("## 제목\n\n**굵게** [링크](https://a.b)")).toBe("제목 굵게 링크");
    expect(plainText("가".repeat(200), 10)).toHaveLength(10);
  });

  it("finds the first image", () => {
    expect(firstImage(post.body)).toBe("/api/uploads/a.png");
    expect(firstImage("없음")).toBeNull();
  });
});

describe("postGraph", () => {
  const graph = postGraph(post)["@graph"] as Record<string, any>[];
  const article = graph.find((n) => n["@type"] === "BlogPosting")!;

  it("builds BlogPosting from post data", () => {
    expect(article.headline).toBe(post.title);
    expect(article.datePublished).toBe(post.publishedAt);
    expect(article.dateModified).toBe(post.updatedAt);
    expect(article.keywords).toBe("react, 성능");
    expect(article.url).toContain(encodeURIComponent(post.slug));
  });

  it("uses the first body image as an absolute url", () => {
    expect(article.image).toMatch(/^https?:\/\/.*\/api\/uploads\/a\.png$/);
  });

  it("links the author to the same Person id as the CV site", () => {
    const person = graph.find((n) => n["@type"] === "Person")!;
    expect(person["@id"]).toBe("https://mlnl.site/#person");
    expect(article.author["@id"]).toBe(person["@id"]);
  });

  it("does not invent fields that are missing", () => {
    const bare = postGraph({ ...post, tags: [], body: "글", publishedAt: null })["@graph"] as Record<string, any>[];
    const a = bare.find((n) => n["@type"] === "BlogPosting")!;
    expect(a).not.toHaveProperty("image");
    expect(a).not.toHaveProperty("keywords");
    expect(a).not.toHaveProperty("datePublished");
  });

  it("breadcrumbs end at the post", () => {
    const list = graph.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement;
    expect(list.map((x: any) => x.position)).toEqual([1, 2, 3]);
    expect(list[2].name).toBe(post.title);
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag", () => {
    expect(serializeJsonLd({ a: "</script><script>alert(1)" })).not.toContain("</script");
  });
});

describe("slugify", () => {
  it("keeps Korean and collapses separators", () => {
    expect(slugify("  Next.js 16, 써보니! ")).toBe("next-js-16-써보니");
  });
});

describe("formatShortDate", () => {
  it("uses Korean time", () => {
    expect(formatShortDate("2026-10-31T16:00:00.000Z")).toBe("2026.11.01");
    expect(formatShortDate(null)).toBe("");
  });
});

describe("firstImage", () => {
  it("skips addresses a browser cannot open", () => {
    expect(firstImage("![노션](attachment:a:image.png)\n![실제](https://a.com/x.png)")).toBe("https://a.com/x.png");
    expect(firstImage("![노션](attachment:a:image.png)")).toBeNull();
  });
});
