import { mergeAttributes, Node } from "@tiptap/core";
import { CALLOUT_TYPES, isCalloutType } from "./callout";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: { setCallout: (type?: string) => ReturnType };
  }
}

const TOKEN = new RegExp(`^ {0,3}> ?\\[!(${CALLOUT_TYPES.join("|")})\\][ \\t]*(.*)(?:\\n|$)((?: {0,3}>.*(?:\\n|$))*)`, "i");

/** 저장은 인용문 문법을 그대로 쓰므로 콜아웃을 모르는 곳에서도 글이 인용문으로 읽힙니다 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-type") ?? "note",
        renderHTML: (attrs) => ({ "data-type": attrs.type as string }),
      },
    };
  },

  parseHTML: () => [{ tag: "aside[data-callout]" }],

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes({ "data-callout": "", class: "callout" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCallout:
        (type = "note") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
    };
  },

  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src) => src.search(/^ {0,3}> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const m = TOKEN.exec(src);
      if (!m) return undefined;
      const rest = m[3]!.split("\n").map((line) => line.replace(/^ {0,3}> ?/, ""));
      const inner = [m[2]!, ...rest].join("\n").trim();
      return { type: "callout", raw: m[0], calloutType: m[1]!.toLowerCase(), tokens: lexer.blockTokens(inner) };
    },
  },

  parseMarkdown(token, helpers) {
    const type = String(token.calloutType ?? "note");
    const children = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode("callout", { type: isCalloutType(type) ? type : "note" }, children.length ? children : [{ type: "paragraph" }]);
  },

  renderMarkdown(node, helpers) {
    const body = helpers.renderChildren(node.content ?? [], "\n\n");
    const lines = body.split("\n").map((line) => (line ? `> ${line}` : ">"));
    return [`> [!${(node.attrs?.type as string) ?? "note"}]`, ...lines].join("\n");
  },
});
