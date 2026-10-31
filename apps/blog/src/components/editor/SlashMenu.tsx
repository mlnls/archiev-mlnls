"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { filterSlashItems, matchSlash, slashKeys, type SlashItem } from "./slash";

interface MenuState {
  from: number;
  to: number;
  query: string;
  inTable: boolean;
  top: number;
  left: number;
}

export function SlashMenu({ editor, wrapRef, pickImage }: { editor: Editor; wrapRef: RefObject<HTMLDivElement | null>; pickImage: () => void }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [index, setIndex] = useState(0);
  /** Esc로 닫은 "/"로는 다시 열지 않습니다 */
  const dismissed = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const items = menu ? filterSlashItems(menu.query, menu.inTable) : [];

  const close = useCallback(() => {
    setMenu(null);
    setIndex(0);
  }, []);

  const refresh = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || editor.isDestroyed) return close();
    const { view } = editor;
    const { $from, empty } = view.state.selection;
    if (!empty || !$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return close();

    const match = matchSlash($from.parent.textBetween(0, $from.parentOffset, "\n", " "));
    if (!match) {
      dismissed.current = null;
      return close();
    }
    const from = $from.start() + match.offset;
    const inTable = editor.isActive("table");
    if (dismissed.current === from || filterSlashItems(match.query, inTable).length === 0) return close();

    const coords = view.coordsAtPos(from);
    const box = wrap.getBoundingClientRect();
    setMenu((prev) => {
      if (prev?.from !== from) setIndex(0);
      return { from, to: $from.pos, query: match.query, inTable, top: coords.bottom - box.top + 6, left: coords.left - box.left };
    });
  }, [editor, wrapRef, close]);

  useEffect(() => {
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    editor.on("blur", close);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
      editor.off("blur", close);
    };
  }, [editor, refresh, close]);

  const choose = useCallback(
    (item: SlashItem | undefined) => {
      if (!menu || !item) return;
      editor.chain().focus().deleteRange({ from: menu.from, to: menu.to }).run();
      close();
      item.run({ editor, pickImage });
    },
    [editor, menu, close, pickImage],
  );

  useEffect(() => {
    if (!menu) return;
    slashKeys.handler = (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setIndex((i) => (i + delta + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        choose(items[Math.min(index, items.length - 1)]);
        return true;
      }
      if (event.key === "Escape") {
        dismissed.current = menu.from;
        close();
        return true;
      }
      return false;
    };
    return () => {
      slashKeys.handler = null;
    };
  }, [menu, items, index, choose, close]);

  useLayoutEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!menu || items.length === 0) return null;

  return (
    <ul ref={list} className="slash" role="listbox" aria-label="블록 선택" style={{ top: menu.top, left: menu.left }}>
      {items.map((item, i) => (
        <li key={item.id}>
          <button type="button" role="option" aria-selected={i === index} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIndex(i)} onClick={() => choose(item)}>
            {item.label}
            <span>{item.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
