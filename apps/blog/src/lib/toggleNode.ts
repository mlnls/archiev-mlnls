import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import type { JSONContent } from "@tiptap/core";

/**
 * 노션의 토글 블록. 저장은 GitHub처럼 HTML details 태그로 합니다.
 *
 * <details>
 * <summary>접힌 제목</summary>
 *
 * 펼치면 보이는 내용
 *
 * </details>
 *
 * 제목은 글자만 받습니다. 공개 글에서 summary 안의 마크다운은 서식으로 바뀌지 않기 때문입니다.
 */
const OPEN = /^ {0,3}<details>[ \t]*\n?[ \t]*<summary>([^\n]*?)<\/summary>[ \t]*(?:\n|$)/;
const TAG = /^ {0,3}<(\/?)details>[ \t]*$/gm;

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&amp;": "&" };
export const decodeSummary = (text: string) => text.replace(/&(?:lt|gt|quot|amp);/g, (e) => ENTITIES[e]!);
export const encodeSummary = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(textOf).join("");

export const Toggle = Details.extend({
  markdownTokenizer: {
    name: "details",
    level: "block",
    start: (src: string) => src.search(/^ {0,3}<details>/m),
    tokenize(src, _tokens, lexer) {
      const open = OPEN.exec(src);
      if (!open) return undefined;
      // 안쪽에 토글이 또 있을 수 있어서 여닫는 태그 수를 셉니다
      let depth = 1;
      TAG.lastIndex = open[0].length;
      for (let m = TAG.exec(src); m; m = TAG.exec(src)) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) {
          const inner = src.slice(open[0].length, m.index).trim();
          return { type: "details", raw: src.slice(0, m.index + m[0].length), summary: decodeSummary(open[1]!.trim()), tokens: lexer.blockTokens(inner) };
        }
      }
      return undefined;
    },
  },

  parseMarkdown(token, helpers) {
    const summary = String(token.summary ?? "");
    const children = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode("details", {}, [
      { type: "detailsSummary", content: summary ? [{ type: "text", text: summary }] : [] },
      { type: "detailsContent", content: children.length ? children : [{ type: "paragraph" }] },
    ]);
  },

  renderMarkdown(node, helpers) {
    const [summary, content] = node.content ?? [];
    const body = helpers.renderChildren(content?.content ?? [], "\n\n").trim();
    return `<details>\n<summary>${encodeSummary(summary ? textOf(summary).replace(/\n/g, " ") : "")}</summary>\n\n${body}\n\n</details>`;
  },
}).configure({
  renderToggleButton: ({ element, isOpen }) => {
    element.setAttribute("aria-label", isOpen ? "토글 접기" : "토글 펼치기");
    element.setAttribute("contenteditable", "false");
  },
});

/** 제목 칸에는 서식 없이 글자만 둡니다 */
export const ToggleSummary = DetailsSummary.extend({ marks: "" });

export { DetailsContent as ToggleContent };
