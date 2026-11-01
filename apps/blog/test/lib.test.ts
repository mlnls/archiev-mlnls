import { describe, expect, it } from "vitest";
import { formatShortDate, slugify } from "@/lib/client";
import { postGraph, serializeJsonLd } from "@/lib/jsonld";
import { isPublicAddress, parseLinkPreview } from "@/lib/linkPreview";
import { extractHeadings, firstImage, plainText, renderMarkdown } from "@/lib/markdown";
import type { PreviewFetcher } from "@/lib/markdownBlocks";
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

describe("callout", () => {
  it("renders the marker as a callout and removes the marker text", async () => {
    const html = await renderMarkdown("> [!tip]\n> 먼저 **읽기**\n>\n> 둘째 문단");
    expect(html).toContain('<aside class="callout" data-type="tip" role="note">');
    expect(html).not.toContain("[!tip]");
    expect(html).toContain("<strong>읽기</strong>");
    expect(html).toContain("둘째 문단");
  });

  it("leaves other quotes and unknown markers alone", async () => {
    expect(await renderMarkdown("> 인용")).toContain("<blockquote>");
    expect(await renderMarkdown("> [!없는것]\n> 글")).toContain("<blockquote>");
  });

  it("keeps the marker out of the summary", () => {
    expect(plainText("> [!note]\n> 내용")).toBe("내용");
  });
});

describe("link cards", () => {
  const preview: PreviewFetcher = async () => ({ title: "제목 <b>", description: "설명", image: "https://a.com/o.png", icon: "https://a.com/i.ico" });
  const render = (source: string, fetchPreview = preview) => renderMarkdown(source, { fetchPreview });

  it("turns a url alone on a line into a card and escapes page text", async () => {
    const html = await render("https://a.com/doc");
    expect(html).toContain('class="bookmark" href="https://a.com/doc"');
    expect(html).toContain("제목 &#x3C;b>");
    expect(html).toContain('src="https://a.com/o.png"');
    expect(html).not.toContain("<p>");
  });

  it("reads the editor's link form, list items and lines inside a paragraph", async () => {
    const saved = "- 문서입니다.\n\n  [https://a.com/x?v=1&amp;t=2](https://a.com/x?v=1&amp;t=2)\n\n  [https://b.com](https://b.com)";
    const html = await render(saved);
    expect(html.match(/class="bookmark"/g)).toHaveLength(2);
    expect(html).toContain("문서입니다.");
    const lines = await render("앞줄\nhttps://a.com/one\n뒷줄");
    expect(lines).toContain("<p>앞줄</p>");
    expect(lines).toContain("<p>뒷줄</p>");
    expect(await render("- https://a.com/tight")).toContain('class="bookmark"');
  });

  it("leaves named links and urls inside a sentence as links", async () => {
    let calls = 0;
    const count: PreviewFetcher = async () => (calls++, null);
    const html = await render("[문서](https://a.com)\n\n여기 https://a.com/b 를 보세요", count);
    expect(html).not.toContain("bookmark");
    expect(calls).toBe(0);
  });

  it("still shows a working card when the site cannot be read", async () => {
    const html = await render("https://www.a.com/doc", async () => { throw new Error("x"); });
    expect(html).toContain('href="https://www.a.com/doc"');
    expect(html).toContain("a.com/doc");
  });

  it("does not make cards from unsafe links", async () => {
    expect(await render("[javascript:alert(1)](javascript:alert(1))")).not.toContain("bookmark");
  });
});

describe("link preview", () => {
  it("reads open graph values and resolves relative addresses", () => {
    const got = parseLinkPreview(`<head><title>옛 제목</title><meta content="R&amp;D 글" property="og:title"><meta name='description' content='설명'><meta property="og:image" content="/o.png"><link rel="shortcut icon" href="/i.png"></head>`, "https://a.com/p/q");
    expect(got).toEqual({ title: "R&D 글", description: "설명", image: "https://a.com/o.png", icon: "https://a.com/i.png" });
  });

  it("falls back to the title and the default icon, and refuses script image urls", () => {
    const got = parseLinkPreview(`<title> 그냥 &#51228;&#47785; </title><meta property="og:image" content="javascript:alert(1)">`, "https://a.com");
    expect(got).toMatchObject({ title: "그냥 제목", image: null, icon: "https://a.com/favicon.ico" });
  });

  it.each(["127.0.0.1", "10.1.2.3", "172.18.0.4", "192.168.0.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "이상한값"])("blocks internal address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
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
