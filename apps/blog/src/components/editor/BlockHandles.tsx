"use client";

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";

interface Target {
  pos: number;
  top: number;
}

/** 줄 왼쪽의 손잡이. ＋는 아래에 줄 추가, ⠿는 끌어서 옮기기와 복제·삭제입니다 */
export function BlockHandles({ editor, wrapRef }: { editor: Editor; wrapRef: RefObject<HTMLDivElement | null> }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onMove = (event: MouseEvent) => {
      if (menuOpenRef.current || editor.isDestroyed) return;
      const { view } = editor;
      let hit: { pos: number; el: HTMLElement } | null = null;
      view.state.doc.forEach((_node, offset) => {
        if (hit) return;
        const dom = view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement)) return;
        const rect = dom.getBoundingClientRect();
        if (event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 2) hit = { pos: offset, el: dom };
      });
      if (!hit) return;
      const { pos, el } = hit as { pos: number; el: HTMLElement };
      const rect = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || rect.height;
      setTarget({ pos, top: rect.top - wrap.getBoundingClientRect().top + Math.min(lineHeight, rect.height) / 2 });
    };
    const onHide = () => {
      if (!menuOpenRef.current) setTarget(null);
    };

    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onHide);
    wrap.addEventListener("keydown", onHide);
    window.addEventListener("scroll", onHide, true);
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onHide);
      wrap.removeEventListener("keydown", onHide);
      window.removeEventListener("scroll", onHide, true);
    };
  }, [editor, wrapRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest(".block-tools")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  if (!target) return null;

  const { pos } = target;
  const node = () => editor.state.doc.nodeAt(pos);
  const done = () => {
    setMenuOpen(false);
    setTarget(null);
  };

  const addBelow = () => {
    const current = node();
    if (!current) return;
    const at = pos + current.nodeSize;
    editor.chain().insertContentAt(at, { type: "paragraph" }).focus(at + 1).run();
    done();
  };

  const duplicate = () => {
    const current = node();
    if (current) editor.chain().insertContentAt(pos + current.nodeSize, current.toJSON()).focus().run();
    done();
  };

  const remove = () => {
    const current = node();
    if (current) editor.chain().deleteRange({ from: pos, to: pos + current.nodeSize }).focus().run();
    done();
  };

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    const { view } = editor;
    if (!node()) return;
    setMenuOpen(false);
    const selection = NodeSelection.create(view.state.doc, pos);
    view.dispatch(view.state.tr.setSelection(selection));
    const dom = view.nodeDOM(pos);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "");
    if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
    // 놓는 처리는 ProseMirror가 맡습니다
    view.dragging = { slice: selection.content(), move: true };
  };

  return (
    <div className="block-tools" style={{ top: target.top }}>
      <button type="button" className="block-tool" aria-label="아래에 줄 추가" onClick={addBelow}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="block-tool block-grip"
        draggable
        aria-label="끌어서 옮기기, 눌러서 메뉴 열기"
        aria-expanded={menuOpen}
        onDragStart={onDragStart}
        onDragEnd={() => setTarget(null)}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.2" />
          <circle cx="9" cy="3" r="1.2" />
          <circle cx="5" cy="7" r="1.2" />
          <circle cx="9" cy="7" r="1.2" />
          <circle cx="5" cy="11" r="1.2" />
          <circle cx="9" cy="11" r="1.2" />
        </svg>
      </button>
      {menuOpen && (
        <div className="block-menu" role="menu">
          <button type="button" role="menuitem" onClick={duplicate}>복제</button>
          <button type="button" role="menuitem" className="danger" onClick={remove}>삭제</button>
        </div>
      )}
    </div>
  );
}
