"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { normalizeLink } from "@/lib/editor";

interface Spot {
  top: number;
  left: number;
}

/** 글자를 고르면 위에 뜨는 서식 막대 */
export function SelectionToolbar({ editor, wrapRef }: { editor: Editor; wrapRef: RefObject<HTMLDivElement | null> }) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const bar = useRef<HTMLDivElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  const place = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || editor.isDestroyed) return setSpot(null);
    const { view } = editor;
    // 링크 입력칸을 쓰는 동안에는 편집기 초점이 잠시 빠집니다
    if (!view.hasFocus() && !bar.current?.contains(document.activeElement)) return setSpot(null);

    const { selection } = view.state;
    if (selection.empty || !selection.$from.parent.isTextblock || selection.$from.parent.type.name === "codeBlock") return setSpot(null);

    const start = view.coordsAtPos(selection.from);
    const end = view.coordsAtPos(selection.to, -1);
    const box = wrap.getBoundingClientRect();
    const width = bar.current?.offsetWidth ?? 300;
    const center = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2;
    // 왼쪽 손잡이 여백을 덮지 않도록 본문 칸 안에 둡니다
    const inset = parseFloat(getComputedStyle(wrap).paddingLeft) || 0;
    setSpot({
      top: Math.min(start.top, end.top) - box.top - 44,
      left: Math.max(inset, Math.min(center - box.left - width / 2, box.width - width)),
    });
  }, [editor, wrapRef]);

  const openLink = useCallback(() => {
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkMode(true);
    setTimeout(() => linkInput.current?.focus(), 0);
  }, [editor]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const onBlur = ({ event }: { event: FocusEvent }) => {
      if (event.relatedTarget instanceof Node && bar.current?.contains(event.relatedTarget)) return;
      if (bar.current?.contains(document.activeElement)) return;
      setSpot(null);
      setLinkMode(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !editor.state.selection.empty) {
        e.preventDefault();
        openLink();
      }
    };
    editor.on("selectionUpdate", place);
    editor.on("update", place);
    editor.on("blur", onBlur);
    wrap?.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      editor.off("selectionUpdate", place);
      editor.off("update", place);
      editor.off("blur", onBlur);
      wrap?.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [editor, wrapRef, place, openLink]);

  useEffect(() => {
    if (!spot) setLinkMode(false);
  }, [spot]);

  if (!spot) return null;

  const applyLink = () => {
    const href = linkValue.trim();
    const link = editor.chain().focus().extendMarkRange("link");
    if (href) link.setLink({ href: normalizeLink(href) }).run();
    else link.unsetLink().run();
    setLinkMode(false);
  };

  const tool = (label: string, content: ReactNode, active: boolean, run: () => void) => (
    <button type="button" className="sel-btn" aria-label={label} title={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {content}
    </button>
  );
  const run = () => editor.chain().focus();

  return (
    <div ref={bar} className="sel-bar" role="toolbar" aria-label="글자 서식" style={{ top: spot.top, left: spot.left }}>
      {linkMode ? (
        <>
          <input
            ref={linkInput}
            className="sel-link-input"
            aria-label="링크 주소"
            placeholder="주소를 붙여넣으세요"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setLinkMode(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="button" className="sel-btn" onClick={applyLink}>적용</button>
        </>
      ) : (
        <>
          {tool("굵게", <b>B</b>, editor.isActive("bold"), () => run().toggleBold().run())}
          {tool("기울임", <i>I</i>, editor.isActive("italic"), () => run().toggleItalic().run())}
          {tool("취소선", <s>S</s>, editor.isActive("strike"), () => run().toggleStrike().run())}
          {tool("인라인 코드", "<>", editor.isActive("code"), () => run().toggleCode().run())}
          {tool("링크", "링크", editor.isActive("link"), openLink)}
          <span className="sel-sep" aria-hidden="true" />
          {tool("제목 2", "H2", editor.isActive("heading", { level: 2 }), () => run().toggleHeading({ level: 2 }).run())}
          {tool("제목 3", "H3", editor.isActive("heading", { level: 3 }), () => run().toggleHeading({ level: 3 }).run())}
          {tool("목록", "••", editor.isActive("bulletList"), () => run().toggleBulletList().run())}
        </>
      )}
    </div>
  );
}
