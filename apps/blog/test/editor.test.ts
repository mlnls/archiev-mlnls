import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { filterSlashItems, matchSlash } from "@/components/editor/slash";
import { cleanMarkdown, looksLikeMarkdown, normalizeLink, parseTags } from "@/lib/editor";
import { bodyExtensions } from "@/lib/editorExtensions";
import { buildLlmsTxt, buildRss } from "@/lib/feeds";
import { plainText, renderMarkdown } from "@/lib/markdown";
import type { PostSummary } from "@/lib/types";

const open = (markdown: string) => new Editor({ extensions: bodyExtensions(), content: markdown, contentType: "markdown" });
const roundTrip = (markdown: string) => cleanMarkdown(open(markdown).getMarkdown());

describe("markdown round trip", () => {
  const SAMPLE = `## 제목 둘

본문 **굵게** *기울임* ~~취소~~ \`코드\` [링크](https://a.com/x_y) 끝.
둘째 줄

### 제목 셋

- 하나
  - 중첩
- 둘

1. 첫째
2. 둘째

- [ ] 할 일
- [x] 끝난 일

> 인용 문단

\`\`\`ts
const a: number = 1;

// 빈 줄 포함
\`\`\`

\`\`\`
plain
\`\`\`

| 항목 | 내용 |
| --- | --- |
| a | **b** |
| c \\| d | e |

---

![대체 글](https://a.com/i.png)

1 * 2 * 3 그리고 snake_case_word, 100% &lt;tag&gt; & [not link]
`;

  it("keeps what readers see after going through the editor", async () => {
    const options = { fetchPreview: async () => null };
    expect(await renderMarkdown(roundTrip(SAMPLE), options)).toBe(await renderMarkdown(SAMPLE, options));
  });

  it("keeps a callout, its type and several paragraphs", () => {
    const source = "앞 문단\n\n> [!warning]\n> 첫 줄 **굵게**\n>\n> - 목록\n\n뒤 문단";
    expect(roundTrip(source)).toBe(source);
    expect(open(source).getJSON().content?.[1]).toMatchObject({ type: "callout", attrs: { type: "warning" } });
  });

  it("leaves an ordinary quote as a quote", () => {
    expect(open("> 그냥 인용").getJSON().content?.[0]?.type).toBe("blockquote");
  });

  it("turns the slash command into a callout that saves as markdown", () => {
    const editor = open("메모");
    editor.commands.setCallout("tip");
    expect(cleanMarkdown(editor.getMarkdown())).toBe("> [!tip]\n> 메모");
  });

  it("is stable when saved repeatedly", () => {
    const once = roundTrip(SAMPLE);
    expect(roundTrip(once)).toBe(once);
  });

  it("does not leave &nbsp; from the trailing empty line", () => {
    const editor = open("가나다");
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    expect(editor.getMarkdown()).toContain("&nbsp;");
    expect(cleanMarkdown(editor.getMarkdown())).toBe("가나다");
  });

  it("treats an empty document as empty so it cannot be saved", () => {
    expect(cleanMarkdown(open("").getMarkdown())).toBe("");
  });
});

describe("plainText", () => {
  it("undoes the escaping added by the editor", () => {
    expect(plainText("R&amp;D 1 \\+ 2 &lt;기록&gt;")).toBe("R&D 1 + 2 <기록>");
  });
});

describe("slash menu", () => {
  it("opens at the start of a line or after a space", () => {
    expect(matchSlash("/")).toEqual({ offset: 0, query: "" });
    expect(matchSlash("/코드")).toEqual({ offset: 0, query: "코드" });
    expect(matchSlash("중간 /코드")).toEqual({ offset: 3, query: "코드" });
    expect(matchSlash("a/b")).toBeNull();
    expect(matchSlash("/a b")).toBeNull();
  });

  it("filters by label or keyword", () => {
    expect(filterSlashItems("코드", false).map((c) => c.id)).toEqual(["code"]);
    expect(filterSlashItems("h3", false).map((c) => c.id)).toEqual(["h3"]);
    expect(filterSlashItems("zzz", false)).toEqual([]);
  });

  it("shows table actions only inside a table", () => {
    expect(filterSlashItems("", false).some((c) => c.id === "row")).toBe(false);
    expect(filterSlashItems("", true).some((c) => c.id === "row")).toBe(true);
  });
});

describe("normalizeLink", () => {
  it("adds https only when no protocol is given", () => {
    expect(normalizeLink(" a.com/x ")).toBe("https://a.com/x");
    expect(normalizeLink("https://a.com")).toBe("https://a.com");
    expect(normalizeLink("/posts/a")).toBe("/posts/a");
    expect(normalizeLink("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("neutralizes script urls", () => {
    expect(normalizeLink("javascript:alert(1)")).toBe("https://javascript:alert(1)");
  });
});

describe("looksLikeMarkdown", () => {
  it("detects markdown blocks and inline marks", () => {
    expect(looksLikeMarkdown("## 제목\n본문")).toBe(true);
    expect(looksLikeMarkdown("앞 줄\n- 목록")).toBe(true);
    expect(looksLikeMarkdown("글 **굵게** 글")).toBe(true);
    expect(looksLikeMarkdown("[링크](https://a.com)")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(looksLikeMarkdown("그냥 글입니다. 2 * 3 = 6")).toBe(false);
    expect(looksLikeMarkdown("https://a.com/x_y")).toBe(false);
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
