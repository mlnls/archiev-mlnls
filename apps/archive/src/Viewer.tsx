import { useEffect, useRef, useState } from "react";
import { extOf, formatBytes, formatDate } from "./lib";
import type { Folder, Item } from "./types";

interface Props {
  item: Item;
  folders: Folder[];
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDelete: (item: Item) => void;
  onSaveMemo: (item: Item, memo: string) => Promise<void>;
  /** 고른 값: 폴더 id, newFolderValue(새 폴더), outValue(폴더에서 빼기) */
  onMove: (item: Item, value: string) => void;
  newFolderValue: string;
  outValue: string;
}

export function Viewer({ item, folders, hasPrev, hasNext, onPrev, onNext, onClose, onDelete, onSaveMemo, onMove, newFolderValue, outValue }: Props) {
  const [memo, setMemo] = useState(item.memo);
  const [memoState, setMemoState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [broken, setBroken] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMemo(item.memo);
    setMemoState("idle");
    setBroken(false);
  }, [item.id, item.memo]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      prevFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, select, input") || document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, onPrev, onNext, onClose]);

  const saveMemo = async () => {
    if (memo.trim() === item.memo) return;
    setMemoState("saving");
    try {
      await onSaveMemo(item, memo);
      setMemoState("saved");
    } catch {
      setMemoState("error");
    }
  };

  const src = `/files/${item.id}`;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="viewer-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {broken ? (
          <div className="viewer-fallback">
            <span className="tile-ext">{extOf(item.name) || item.kind}</span>
            <p>이 브라우저에서는 바로 볼 수 없는 형식입니다. 내려받아 열어 주세요.</p>
          </div>
        ) : item.kind === "image" ? (
          <img key={item.id} src={src} alt={item.memo || item.name} onError={() => setBroken(true)} />
        ) : (
          <video key={item.id} src={src} controls autoPlay playsInline preload="metadata" onError={() => setBroken(true)} />
        )}
        {hasPrev && (
          <button className="nav prev" onClick={onPrev} aria-label="이전">
            <svg viewBox="0 0 20 20" width="20" height="20"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        )}
        {hasNext && (
          <button className="nav next" onClick={onNext} aria-label="다음">
            <svg viewBox="0 0 20 20" width="20" height="20"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        )}
      </div>

      <aside className="viewer-info">
        <div className="viewer-head">
          <h2 title={item.name}>{item.name}</h2>
          <button ref={closeRef} className="ghost" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </div>
        <dl>
          <dt>찍은 날</dt>
          <dd>{formatDate(item.takenAt)}</dd>
          <dt>올린 날</dt>
          <dd>{formatDate(item.uploadedAt)}</dd>
          <dt>크기</dt>
          <dd>
            {formatBytes(item.size)}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
          </dd>
        </dl>
        <label className="field">
          폴더
          <select
            value={item.folderId ?? outValue}
            onChange={(e) => {
              if (e.target.value !== (item.folderId ?? outValue)) onMove(item, e.target.value);
            }}
          >
            <option value={outValue}>폴더 없음</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value={newFolderValue}>새 폴더 만들기</option>
          </select>
        </label>
        <label className="memo">
          메모
          <textarea
            value={memo}
            maxLength={2000}
            rows={4}
            placeholder="어디서, 누구와, 무엇을"
            onChange={(e) => {
              setMemo(e.target.value);
              setMemoState("idle");
            }}
            onBlur={saveMemo}
          />
          <span className="small muted" aria-live="polite">
            {memoState === "saving" ? "저장 중" : memoState === "saved" ? "저장했습니다" : memoState === "error" ? "저장하지 못했습니다" : ""}
          </span>
        </label>
        <div className="viewer-actions">
          <a className="button" href={`${src}?download=1`} download={item.name}>
            내려받기
          </a>
          <button
            className="danger"
            onClick={() => {
              if (confirm(`"${item.name}"을(를) 지울까요? 되돌릴 수 없습니다.`)) onDelete(item);
            }}
          >
            지우기
          </button>
        </div>
      </aside>
    </div>
  );
}
