"use client";

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useCallback, useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { canTurnInto, deleteBlock, duplicateBlock, LIST_TYPES, moveBlock, TURN_INTO, turnInto, type BlockRef } from "@/lib/blockOps";

interface Target extends BlockRef {
  dom: HTMLElement;
  top: number;
}

const ITEM_TYPES = new Set(["listItem", "taskItem"]);

/** 화면에 보이는 블록을 문서 순서대로. 목록은 항목마다 손잡이를 따로 둡니다 */
function collectBlocks(view: EditorView): { pos: number; node: PMNode; dom: HTMLElement }[] {
  const out: { pos: number; node: PMNode; dom: HTMLElement }[] = [];
  const visit = (node: PMNode, pos: number) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    if (LIST_TYPES.has(node.type.name)) {
      node.forEach((item, offset) => {
        const itemPos = pos + 1 + offset;
        const itemDom = view.nodeDOM(itemPos);
        if (!(itemDom instanceof HTMLElement)) return;
        out.push({ pos: itemPos, node: item, dom: itemDom });
        item.forEach((child, childOffset) => {
          if (LIST_TYPES.has(child.type.name)) visit(child, itemPos + 1 + childOffset);
        });
      });
      return;
    }
    out.push({ pos, node, dom });
  };
  view.state.doc.forEach((node, offset) => visit(node, offset));
  return out;
}

/** 손잡이를 블록 첫 줄 가운데에 맞춥니다 */
function firstLineTop(dom: HTMLElement, node: PMNode) {
  const rect = dom.getBoundingClientRect();
  const first = ITEM_TYPES.has(node.type.name) ? (dom.querySelector("p") ?? dom) : dom;
  const style = getComputedStyle(first);
  const line = Number.parseFloat(style.lineHeight);
  if (!node.isTextblock && !ITEM_TYPES.has(node.type.name)) return rect.top + 2;
  const firstRect = first.getBoundingClientRect();
  return firstRect.top + Number.parseFloat(style.paddingTop || "0") + ((Number.isFinite(line) ? line : 24) - 24) / 2;
}

function blockAt(view: EditorView, y: number) {
  const blocks = collectBlocks(view);
  let hit = blocks[0];
  for (const b of blocks) {
    if (b.dom.getBoundingClientRect().top <= y + 4) hit = b;
    else break;
  }
  return hit ?? null;
}

/**
 * 노션처럼 블록 왼쪽에 뜨는 + 와 ⋮⋮.
 * + 는 아래에 새 블록을 만들고 / 메뉴를 열고, ⋮⋮ 는 끌어서 옮기거나 눌러서 메뉴를 엽니다.
 */
export function BlockHandle({ editor, wrapRef }: { editor: Editor; wrapRef: RefObject<HTMLDivElement | null> }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menu, setMenu] = useState(false);
  const handle = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const locate = useCallback(
    (x: number, y: number) => {
      const wrap = wrapRef.current;
      if (!wrap || editor.isDestroyed || editor.view.dragging) return;
      const box = wrap.getBoundingClientRect();
      // 글 왼쪽의 빈 곳(손잡이 자리)까지 포함해서 봅니다
      if (x < box.left - 72 || x > box.right + 24 || y < box.top || y > box.bottom) return setTarget(null);
      const hit = blockAt(editor.view, y);
      if (!hit) return setTarget(null);
      setTarget({ ...hit, top: firstLineTop(hit.dom, hit.node) - box.top });
    },
    [editor, wrapRef],
  );

  useEffect(() => {
    if (menu) return;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => locate(e.clientX, e.clientY));
    };
    // 글을 쓰는 동안에는 숨깁니다. 마우스를 움직이면 다시 나옵니다
    const hide = () => setTarget(null);
    document.addEventListener("mousemove", onMove);
    editor.view.dom.addEventListener("keydown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      cancelAnimationFrame(frame.current);
      document.removeEventListener("mousemove", onMove);
      editor.view.dom.removeEventListener("keydown", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [editor, locate, menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!handle.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        editor.commands.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, editor]);

  /** 지금 문서에서 손잡이가 가리키는 블록. 그사이 글이 바뀌었을 수 있어 다시 찾습니다 */
  const current = (): BlockRef | null => {
    if (!target) return null;
    const node = editor.state.doc.nodeAt(target.pos);
    return node ? { pos: target.pos, node } : null;
  };

  const add = () => {
    const block = current();
    if (!block) return;
    const { node, pos } = block;
    const end = pos + node.nodeSize;
    const empty = node.type.name === "paragraph" && node.content.size === 0;
    const chain = editor.chain().focus();
    if (empty) {
      chain.setTextSelection(pos + 1).insertContent("/").run();
    } else {
      const fresh = ITEM_TYPES.has(node.type.name)
        ? { type: node.type.name, content: [{ type: "paragraph", content: [{ type: "text", text: "/" }] }] }
        : { type: "paragraph", content: [{ type: "text", text: "/" }] };
      chain
        .insertContentAt(end, fresh)
        .command(({ tr }) => {
          const near = TextSelection.near(tr.doc.resolve(end + 1), 1);
          tr.setSelection(TextSelection.create(tr.doc, near.from + 1));
          return true;
        })
        .run();
    }
    setTarget(null);
  };

  const onDragStart = (e: DragEvent) => {
    const block = current();
    if (!block || !target) return;
    const { view } = editor;
    const selection = NodeSelection.create(view.state.doc, block.pos);
    view.dispatch(view.state.tr.setSelection(selection));
    const slice = selection.content();
    const { dom, text } = view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData("text/html", dom.innerHTML);
    e.dataTransfer.setData("text/plain", text);
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setDragImage(target.dom, 0, 0);
    // 편집기 밖에서 시작한 끌기도 놓을 때 원래 자리를 지우도록 알려 줍니다
    (view as unknown as { dragging: { slice: typeof slice; move: boolean } | null }).dragging = { slice, move: true };
    setMenu(false);
  };

  const onDragEnd = () => {
    (editor.view as unknown as { dragging: unknown }).dragging = null;
    setTarget(null);
  };

  const openMenu = () => {
    const block = current();
    if (!block) return;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, block.pos)));
    editor.view.focus();
    setMenu(true);
  };

  const act = (run: (block: BlockRef) => void) => () => {
    const block = current();
    setMenu(false);
    setTarget(null);
    if (block) run(block);
    editor.commands.focus();
  };

  if (!target) return null;
  const block = current();
  const turnable = block ? canTurnInto(block.node) : false;

  return (
    <div ref={handle} className="block-handle" style={{ top: target.top }}>
      <button type="button" className="bh-btn" aria-label="아래에 블록 추가" title="아래에 블록 추가" onMouseDown={(e) => e.preventDefault()} onClick={add}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="bh-btn bh-grip"
        aria-label="끌어서 옮기기, 눌러서 메뉴 열기"
        title="끌어서 옮기기 · 눌러서 메뉴"
        aria-haspopup="menu"
        aria-expanded={menu}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => (menu ? setMenu(false) : openMenu())}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
          {[2, 8, 14].flatMap((cy) => [<circle key={`a${cy}`} cx="2.5" cy={cy} r="1.5" />, <circle key={`b${cy}`} cx="7.5" cy={cy} r="1.5" />])}
        </svg>
      </button>
      {menu && (
        <div className="bh-menu" role="menu" aria-label="블록 메뉴" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" role="menuitem" onClick={act((b) => deleteBlock(editor, b))}>
            삭제<kbd>Del</kbd>
          </button>
          <button type="button" role="menuitem" onClick={act((b) => duplicateBlock(editor, b))}>
            복제<kbd>⌘D</kbd>
          </button>
          <button type="button" role="menuitem" onClick={act((b) => moveBlock(editor, b, -1))}>
            위로 옮기기<kbd>⌘⇧↑</kbd>
          </button>
          <button type="button" role="menuitem" onClick={act((b) => moveBlock(editor, b, 1))}>
            아래로 옮기기<kbd>⌘⇧↓</kbd>
          </button>
          {turnable && (
            <>
              <p className="bh-label">전환</p>
              {TURN_INTO.map(([id, label]) => (
                <button key={id} type="button" role="menuitem" onClick={act((b) => turnInto(editor, b, id))}>
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
