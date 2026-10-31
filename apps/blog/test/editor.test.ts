import { describe, expect, it } from "vitest";
import { applySlash, filterCommands, insertLink, parseTags, slashQuery, SLASH_COMMANDS, toggleWrap } from "@/lib/editor";
import { buildLlmsTxt, buildRss } from "@/lib/feeds";
import type { PostSummary } from "@/lib/types";

describe("toggleWrap", () => {
  it("wraps and unwraps the selection", () => {
    const on = toggleWrap("가나다", 1, 2, "**");
    expect(on).toEqual({ value: "가**나**다", start: 3, end: 4 });
    expect(toggleWrap(on.value, on.start, on.end, "**")).toEqual({ value: "가나다", start: 1, end: 2 });
  });
});

describe("insertLink", () => {
  it("selects the url placeholder", () => {
    const e = insertLink("글자", 0, 2);
    expect(e.value).toBe("[글자](url)");
    expect(e.value.slice(e.start, e.end)).toBe("url");
  });
});

describe("slash commands", () => {
  it("opens only at the start of a line", () => {
    expect(slashQuery("/", 1)).toEqual({ lineStart: 0, query: "" });
    expect(slashQuery("첫 줄\n/코드", 8)).toEqual({ lineStart: 4, query: "코드" });
    expect(slashQuery("중간 /코드", 6)).toBeNull();
    expect(slashQuery("/a b", 4)).toBeNull();
  });

  it("filters by label or id", () => {
    expect(filterCommands("코드").map((c) => c.id)).toEqual(["code"]);
    expect(filterCommands("h3").map((c) => c.id)).toEqual(["h3"]);
    expect(filterCommands("zzz")).toEqual([]);
  });

  it("replaces the typed command and places the cursor inside a code block", () => {
    const code = SLASH_COMMANDS.find((c) => c.id === "code")!;
    const e = applySlash("앞\n/코드", 2, 5, code);
    expect(e.value).toBe("앞\n```ts\n\n```");
    expect(e.value.slice(0, e.start)).toBe("앞\n```ts\n");
  });
});

describe("parseTags", () => {
  it("trims and removes duplicates", () => {
    expect(parseTags(" react, 성능 ,react,, ")).toEqual(["react", "성능"]);
  });
});

describe("feeds", () => {
  const post: PostSummary = {
    id: 1,
    slug: "a-b",
    title: "R&D <기록>",
    summary: "요약",
    tags: [],
    coverImage: null,
    published: true,
    publishedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    readingMinutes: 1,
  };

  it("escapes xml in RSS", () => {
    const rss = buildRss([post]);
    expect(rss).toContain("R&amp;D &lt;기록&gt;");
    expect(rss).toContain("/posts/a-b");
  });

  it("lists posts in llms.txt", () => {
    expect(buildLlmsTxt([post])).toContain("[R&D <기록>](");
  });
});
