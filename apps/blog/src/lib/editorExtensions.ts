import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import type { NodeViewRenderer } from "@tiptap/core";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

/**
 * 본문은 마크다운으로 저장되므로 마크다운으로 되돌릴 수 있는 블록만 씁니다.
 * 밑줄처럼 저장하면 사라질 서식은 켜지 않습니다.
 */
export function bodyExtensions(codeBlockView?: NodeViewRenderer) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true },
    }),
    CodeBlockLowlight.extend(codeBlockView ? { addNodeView: () => codeBlockView } : {}).configure({ lowlight }),
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? `제목 ${node.attrs.level as number}` : "글을 써보세요. / 를 누르면 블록을 고를 수 있습니다.",
    }),
    Markdown,
  ];
}
