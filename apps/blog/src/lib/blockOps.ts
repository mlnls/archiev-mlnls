import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state";

/**
 * 노션의 블록 다루기: 옮기기, 복제, 지우기, 다른 블록으로 바꾸기.
 * 블록은 문서 맨 위 단계의 노드와, 목록 안의 항목 하나하나입니다.
 */
export const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const ITEM_TYPES = new Set(["listItem", "taskItem"]);

export interface BlockRef {
  pos: number;
  node: PMNode;
}

/** 커서가 있는 블록. 목록 안이면 가장 안쪽 항목입니다 */
export function blockAtSelection(state: EditorState): BlockRef | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) return { pos: selection.from, node: selection.node };
  const { $from } = selection;
  for (let d = $from.depth; d > 0; d--) {
    if (ITEM_TYPES.has($from.node(d).type.name)) return { pos: $from.before(d), node: $from.node(d) };
  }
  if ($from.depth < 1) return null;
  return { pos: $from.before(1), node: $from.node(1) };
}

const caretInside = (doc: PMNode, pos: number) => TextSelection.near(doc.resolve(Math.min(pos + 1, doc.content.size)));

/** 같은 부모 안에서 앞뒤 블록과 자리를 바꿉니다 */
export function moveBlock(editor: Editor, block: BlockRef, dir: -1 | 1): boolean {
  const { state } = editor;
  const $pos = state.doc.resolve(block.pos);
  const index = $pos.index();
  const parent = $pos.parent;
  const sibling = dir < 0 ? (index > 0 ? parent.child(index - 1) : null) : index + 1 < parent.childCount ? parent.child(index + 1) : null;
  if (!sibling) return false;

  const tr = state.tr.delete(block.pos, block.pos + block.node.nodeSize);
  const at = dir < 0 ? block.pos - sibling.nodeSize : block.pos + sibling.nodeSize;
  tr.insert(at, block.node);
  const wasNode = state.selection instanceof NodeSelection;
  tr.setSelection(wasNode ? NodeSelection.create(tr.doc, at) : caretInside(tr.doc, at));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(editor: Editor, block: BlockRef): boolean {
  const end = block.pos + block.node.nodeSize;
  const tr = editor.state.tr.insert(end, block.node.copy(block.node.content));
  tr.setSelection(caretInside(tr.doc, end));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function deleteBlock(editor: Editor, block: BlockRef): boolean {
  const tr = editor.state.tr.delete(block.pos, block.pos + block.node.nodeSize);
  if (tr.doc.childCount === 0) tr.insert(0, editor.schema.nodes.paragraph!.create());
  tr.setSelection(caretInside(tr.doc, Math.max(0, block.pos - 1)));
  editor.view.dispatch(tr);
  return true;
}

export const TURN_INTO = [
  ["text", "본문"],
  ["h2", "제목 2"],
  ["h3", "제목 3"],
  ["ul", "목록"],
  ["ol", "번호 목록"],
  ["todo", "체크리스트"],
  ["toggle", "토글"],
  ["quote", "인용"],
  ["callout", "콜아웃"],
  ["code", "코드"],
] as const;

export type TurnIntoId = (typeof TURN_INTO)[number][0];

/** 글자를 담는 블록만 바꿀 수 있습니다 (이미지, 표, 구분선은 제외) */
export function canTurnInto(node: PMNode): boolean {
  if (node.isAtom || node.type.name === "table") return false;
  return node.isTextblock || node.type.name === "blockquote" || node.type.name === "callout" || ITEM_TYPES.has(node.type.name) || LIST_TYPES.has(node.type.name);
}

/** 블록 전체를 고른 뒤 감싼 것(목록, 인용)을 풀고 원하는 모양을 입힙니다 */
export function turnInto(editor: Editor, block: BlockRef, id: TurnIntoId): boolean {
  const { doc } = editor.state;
  const from = TextSelection.near(doc.resolve(block.pos + 1), 1).$from;
  const to = TextSelection.near(doc.resolve(block.pos + block.node.nodeSize - 1), -1).$to;
  const chain = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setSelection(TextSelection.between(from, to));
      return true;
    })
    .clearNodes();
  switch (id) {
    case "text":
      return chain.setParagraph().run();
    case "h2":
      return chain.setHeading({ level: 2 }).run();
    case "h3":
      return chain.setHeading({ level: 3 }).run();
    case "ul":
      return chain.toggleBulletList().run();
    case "ol":
      return chain.toggleOrderedList().run();
    case "todo":
      return chain.toggleTaskList().run();
    case "toggle":
      return chain.setDetails().run();
    case "quote":
      return chain.setBlockquote().run();
    case "callout":
      return chain.setCallout().run();
    case "code":
      return chain.setCodeBlock().run();
  }
}

/** 노션과 같은 단축키: ⌘⇧↑/↓ 옮기기, ⌘D 복제 */
export const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    const withBlock = (run: (block: BlockRef) => boolean) => () => {
      const block = blockAtSelection(this.editor.state);
      return block ? run(block) : false;
    };
    return {
      "Mod-Shift-ArrowUp": withBlock((b) => moveBlock(this.editor, b, -1)),
      "Mod-Shift-ArrowDown": withBlock((b) => moveBlock(this.editor, b, 1)),
      "Mod-d": withBlock((b) => duplicateBlock(this.editor, b)),
    };
  },
});
