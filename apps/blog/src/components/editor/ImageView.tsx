"use client";

import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { isUnreachable, MIN_WIDTH, type ImageAlign } from "@/lib/imageAttrs";
import { replaceImageFile, uploadState } from "./imageUploads";

const ALIGNS: [ImageAlign, string, string][] = [
  ["left", "왼쪽 정렬", "M3 5h18M3 10h10M3 15h18M3 20h10"],
  ["center", "가운데 정렬", "M3 5h18M7 10h10M3 15h18M7 20h10"],
  ["right", "오른쪽 정렬", "M3 5h18M11 10h10M3 15h18M11 20h10"],
];

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * 노션의 이미지 블록: 양옆 손잡이로 폭 조절, 위에 뜨는 막대로 정렬·캡션·바꾸기·삭제.
 * 올리는 중이면 흐리게 보여 주고, 열 수 없는 주소면 다시 올리라고 알려 줍니다.
 */
export function ImageView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const width = (node.attrs.width as number | null) ?? null;
  const align = (node.attrs.align as ImageAlign) ?? "center";
  const caption = node.attrs.title as string | null;

  const frame = useRef<HTMLDivElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [focusCaption, setFocusCaption] = useState(false);

  // 캡션 칸은 속성이 바뀐 다음 그려지므로, 그려진 뒤에 커서를 옮깁니다
  useEffect(() => {
    if (!focusCaption || !captionInput.current) return;
    captionInput.current.focus();
    setFocusCaption(false);
  }, [focusCaption, caption]);

  const uploading = useSyncExternalStore(uploadState.subscribe, () => uploadState.isPending(src), () => false);
  const orphanBlob = src.startsWith("blob:") && !uploading && !uploadState.isDone(src);
  const broken = isUnreachable(src) || orphanBlob || failed === src;
  const shown = dragWidth ?? width;

  const select = () => {
    const pos = getPos();
    if (typeof pos === "number") editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  };

  /** 가운데 정렬이면 양쪽으로 같이 늘어나므로 움직인 거리의 두 배만큼 바뀝니다 */
  const startResize = (side: "left" | "right") => (e: ReactPointerEvent) => {
    const box = frame.current;
    const column = box?.parentElement;
    if (!box || !column) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startPx = box.getBoundingClientRect().width;
    const columnPx = column.getBoundingClientRect().width;
    const factor = align === "center" ? 2 : 1;
    const sign = side === "right" ? 1 : -1;
    let latest = (startPx / columnPx) * 100;

    const move = (ev: PointerEvent) => {
      const px = startPx + (ev.clientX - startX) * sign * factor;
      latest = Math.min(100, Math.max(MIN_WIDTH, (px / columnPx) * 100));
      setDragWidth(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragWidth(null);
      const rounded = Math.round(latest);
      updateAttributes({ width: rounded >= 100 ? null : rounded });
      select();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const openCaption = () => {
    if (caption === null) updateAttributes({ title: "" });
    setFocusCaption(true);
  };

  /** 캡션에서 Enter를 누르면 이미지 아래로 커서를 옮겨 이어서 쓰게 합니다 */
  const leaveCaption = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const after = pos + node.nodeSize;
    const next = editor.state.doc.nodeAt(after);
    let tr = editor.state.tr;
    if (!next || !next.isTextblock) tr = tr.insert(after, editor.schema.nodes.paragraph!.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
    // 바로 이어서 치는 글자가 캡션 칸에 남지 않게 초점을 곧바로 옮깁니다
    captionInput.current?.blur();
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  const narrow = shown !== null && shown < 100;

  return (
    <NodeViewWrapper as="figure" className={`img-block${selected ? " is-selected" : ""}`} data-align={narrow ? align : undefined}>
      <div ref={frame} className="img-frame" style={narrow ? { width: `${shown}%` } : undefined}>
        {broken ? (
          <div className="img-broken" contentEditable={false}>
            <p>{failed === src ? "이미지를 불러오지 못했어요." : "노션 같은 곳에서 붙여 넣어 열 수 없는 이미지예요."}</p>
            <div>
              <button type="button" onClick={() => fileInput.current?.click()}>다시 올리기</button>
              <button type="button" onClick={deleteNode}>지우기</button>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={(node.attrs.alt as string | null) ?? caption ?? ""}
            data-drag-handle=""
            draggable
            className={uploading ? "is-uploading" : undefined}
            onError={() => setFailed(src)}
            onLoad={() => failed === src && setFailed(null)}
          />
        )}
        {uploading && <span className="img-status" contentEditable={false}>{src.startsWith("blob:") ? "올리는 중" : "서버로 옮기는 중"}</span>}
        {!broken && (
          <>
            <span className="img-resize" data-side="left" onPointerDown={startResize("left")} aria-hidden="true" />
            <span className="img-resize" data-side="right" onPointerDown={startResize("right")} aria-hidden="true" />
            <div className="img-tools" role="toolbar" aria-label="이미지" contentEditable={false}>
              {narrow &&
                ALIGNS.map(([value, label, d]) => (
                  <button key={value} type="button" title={label} aria-label={label} aria-pressed={align === value} onClick={() => updateAttributes({ align: value })}>
                    <Icon d={d} />
                  </button>
                ))}
              <button type="button" onClick={openCaption}>캡션</button>
              <button type="button" onClick={() => fileInput.current?.click()}>바꾸기</button>
              {!src.startsWith("blob:") && (
                <a href={src} target="_blank" rel="noopener noreferrer">원본</a>
              )}
              <button type="button" aria-label="이미지 지우기" title="지우기" onClick={deleteNode}>
                <Icon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </button>
            </div>
          </>
        )}
        {caption !== null && (
          <input
            ref={captionInput}
            className="img-caption"
            aria-label="캡션"
            placeholder="캡션을 쓰세요"
            value={caption}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                leaveCaption();
              } else if (e.key === "Backspace" && !caption) {
                e.preventDefault();
                updateAttributes({ title: null });
                select();
                editor.commands.focus();
              }
            }}
            onBlur={() => {
              if (!caption?.trim()) updateAttributes({ title: null });
            }}
          />
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const pos = getPos();
          if (file && typeof pos === "number") {
            setFailed(null);
            replaceImageFile(editor, pos, file);
          }
        }}
      />
    </NodeViewWrapper>
  );
}
