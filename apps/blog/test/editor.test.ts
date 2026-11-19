import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { filterSlashItems, matchSlash } from "@/components/editor/slash";
import { blockAtSelection, canTurnInto, deleteBlock, duplicateBlock, moveBlock, turnInto } from "@/lib/blockOps";
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

describe("image blocks", () => {
  const source = `앞 문단\n\n![](/api/uploads/a.png#w=60&a=left "고양이가 \\"자는\\" 모습")\n\n뒤 문단`;

  it("keeps width, alignment and caption through the editor", () => {
    const editor = open(source);
    expect(editor.getJSON().content?.[1]).toMatchObject({
      type: "image",
      attrs: { src: "/api/uploads/a.png", width: 60, align: "left", title: '고양이가 "자는" 모습' },
    });
    expect(roundTrip(source)).toBe(source);
  });

  it("drops the layout hash when the image is full width again", () => {
    const editor = open(source);
    editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
    editor.commands.updateAttributes("image", { width: null });
    expect(cleanMarkdown(editor.getMarkdown())).toContain('![](/api/uploads/a.png "고양이가');
  });

  it("draws a figure with the caption below on the public page", async () => {
    const html = await renderMarkdown(source, { fetchPreview: async () => null });
    expect(html).toContain('<figure class="image" style="width: 60%" data-align="left"><img src="/api/uploads/a.png" alt="고양이가 &#x22;자는&#x22; 모습" loading="lazy" decoding="async"><figcaption>고양이가 "자는" 모습</figcaption></figure>');
  });

  it("leaves a plain image without a caption as a plain centered figure", async () => {
    expect(await renderMarkdown("![설명](https://a.com/i.png)", { fetchPreview: async () => null })).toBe(
      '<figure class="image"><img src="https://a.com/i.png" alt="설명" loading="lazy" decoding="async"></figure>',
    );
  });

  it("keeps image urls with brackets and spaces readable as markdown", () => {
    const editor = open("");
    editor.commands.insertContent({ type: "image", attrs: { src: "https://a.com/a (1).png", alt: "a ] b" } });
    expect(cleanMarkdown(editor.getMarkdown())).toBe("![a \\] b](https://a.com/a%20%281%29.png)");
  });
});

describe("toggle blocks", () => {
  const source = "<details>\n<summary>펼쳐 보기 &lt;b&gt;</summary>\n\n안쪽 **굵게**\n\n- 목록\n\n</details>\n\n뒤 문단";

  it("saves as details with the content as markdown", () => {
    const editor = open(source);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "details",
      content: [{ type: "detailsSummary", content: [{ type: "text", text: "펼쳐 보기 <b>" }] }, { type: "detailsContent" }],
    });
    expect(roundTrip(source)).toBe(source);
  });

  it("is made from the slash command around the current line", () => {
    const editor = open("접을 내용");
    editor.commands.setDetails();
    expect(cleanMarkdown(editor.getMarkdown())).toBe("<details>\n<summary></summary>\n\n접을 내용\n\n</details>");
  });

  it("renders as a closed details on the public page and keeps the summary as text", async () => {
    const html = await renderMarkdown(source, { fetchPreview: async () => null });
    expect(html).toContain("<details><summary>펼쳐 보기 &#x3C;b></summary><p>안쪽 <strong>굵게</strong></p>");
    expect(html).toContain("</ul></details>");
    expect(html).not.toContain("<b>");
  });

  it("supports a toggle inside a toggle", async () => {
    const nested = "<details>\n<summary>바깥</summary>\n\n<details>\n<summary>안</summary>\n\n깊은 글\n\n</details>\n\n</details>";
    expect(roundTrip(nested)).toBe(nested);
    const html = await renderMarkdown(nested, { fetchPreview: async () => null });
    expect(html).toBe("<details><summary>바깥</summary><details><summary>안</summary><p>깊은 글</p></details></details>");
  });

  it("does not let other raw html through", async () => {
    const html = await renderMarkdown('<details>\n<summary>a</summary>\n\n<img src=x onerror=alert(1)>\n\n</details>', { fetchPreview: async () => null });
    expect(html).not.toContain("onerror");
  });

  it("leaves summary tags out of the plain text summary", () => {
    expect(plainText(source)).toBe("펼쳐 보기 <b> 안쪽 굵게 목록 뒤 문단");
  });
});

describe("block actions", () => {
  const blocks = (editor: Editor) => cleanMarkdown(editor.getMarkdown());
  const at = (editor: Editor, index: number) => {
    let pos = 0;
    for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
    return { pos, node: editor.state.doc.child(index) };
  };

  it("moves a block up and down", () => {
    const editor = open("하나\n\n둘\n\n셋");
    expect(moveBlock(editor, at(editor, 2), -1)).toBe(true);
    expect(blocks(editor)).toBe("하나\n\n셋\n\n둘");
    expect(moveBlock(editor, at(editor, 0), 1)).toBe(true);
    expect(blocks(editor)).toBe("셋\n\n하나\n\n둘");
    expect(moveBlock(editor, at(editor, 0), -1)).toBe(false);
  });

  it("moves a list item within its list", () => {
    const editor = open("- a\n- b");
    const list = editor.state.doc.child(0);
    expect(moveBlock(editor, { pos: 1 + list.child(0).nodeSize, node: list.child(1) }, -1)).toBe(true);
    expect(blocks(editor)).toBe("- b\n- a");
  });

  it("duplicates and deletes a block", () => {
    const editor = open("## 제목\n\n본문");
    duplicateBlock(editor, at(editor, 0));
    expect(blocks(editor)).toBe("## 제목\n\n## 제목\n\n본문");
    deleteBlock(editor, at(editor, 2));
    expect(blocks(editor)).toBe("## 제목\n\n## 제목");
  });

  it("turns a block into another kind, unwrapping lists first", () => {
    const editor = open("- 목록 항목\n\n문단");
    const list = editor.state.doc.child(0);
    turnInto(editor, { pos: 1, node: list.child(0) }, "h2");
    expect(blocks(editor)).toBe("## 목록 항목\n\n문단");
    turnInto(editor, at(editor, 1), "callout");
    expect(blocks(editor)).toBe("## 목록 항목\n\n> [!note]\n> 문단");
  });

  it("only offers turn-into for blocks that hold text", () => {
    const editor = open("문단\n\n---\n\n![a](/api/uploads/a.png)");
    expect(canTurnInto(at(editor, 0).node)).toBe(true);
    expect(canTurnInto(at(editor, 1).node)).toBe(false);
    expect(canTurnInto(at(editor, 2).node)).toBe(false);
  });

  it("finds the innermost list item at the cursor", () => {
    const editor = open("- 바깥\n  - 안쪽");
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    expect(blockAtSelection(editor.state)?.node.textContent).toBe("안쪽");
  });
});

describe("images that cannot be opened", () => {
  it("leaves out notion attachment images on the public page instead of an empty frame", async () => {
    expect(await renderMarkdown("앞\n\n![](attachment:1234:image.png)\n\n뒤", { fetchPreview: async () => null })).toBe("<p>앞</p>\n\n<p>뒤</p>");
  });
});
