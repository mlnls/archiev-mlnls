import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewRenderer } from "@tiptap/core";
import { common, createLowlight } from "lowlight";
import { BlockKeys } from "./blockOps";
import { Callout } from "./calloutNode";
import { BlogImage } from "./imageNode";
import { Toggle, ToggleContent, ToggleSummary } from "./toggleNode";

const lowlight = createLowlight(common);

/**
 * 본문은 마크다운으로 저장되므로 마크다운으로 되돌릴 수 있는 블록만 씁니다.
 * 밑줄처럼 저장하면 사라질 서식은 켜지 않습니다.
 */
export function bodyExtensions(views: { codeBlock?: NodeViewRenderer; callout?: NodeViewRenderer; image?: NodeViewRenderer } = {}) {
  const { codeBlock: codeBlockView, callout: calloutView, image: imageView } = views;
  return [
    Callout.extend(calloutView ? { addNodeView: () => calloutView } : {}),
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true },
      // 블록을 끌어 옮길 때 놓일 자리를 굵은 선으로 보여 줍니다
      dropcursor: { color: "var(--accent)", width: 3 },
    }),
    CodeBlockLowlight.extend(codeBlockView ? { addNodeView: () => codeBlockView } : {}).configure({ lowlight }),
    BlogImage.extend(imageView ? { addNodeView: () => imageView } : {}),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Toggle,
    ToggleSummary,
    ToggleContent,
    BlockKeys,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return `제목 ${node.attrs.level as number}`;
        if (node.type.name === "detailsSummary") return "토글 제목";
        return "글을 쓰거나 / 로 블록 고르기";
      },
    }),
    Markdown,
  ];
}
