"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeLink } from "@/lib/editor";

interface Props {
  at: { top: number; left: number };
  onFiles: (files: File[]) => void;
  onUrl: (url: string) => void;
  onClose: () => void;
}

/** 노션의 /이미지 창: 파일을 올리거나 이미지 주소를 붙여 넣습니다 */
export function ImagePanel({ at, onFiles, onUrl, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = () => {
    const value = url.trim();
    if (value) onUrl(normalizeLink(value));
  };

  return (
    <div ref={box} className="img-panel" role="dialog" aria-label="이미지 넣기" style={{ top: at.top, left: at.left }}>
      <div className="img-panel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "upload"} onClick={() => setTab("upload")}>올리기</button>
        <button type="button" role="tab" aria-selected={tab === "link"} onClick={() => setTab("link")}>링크</button>
      </div>
      {tab === "upload" ? (
        <div className="img-panel-body">
          <button type="button" className="btn img-panel-main" autoFocus onClick={() => file.current?.click()}>
            파일 고르기
          </button>
          <p>여러 장을 한 번에 고를 수 있어요. 큰 사진은 올리기 전에 줄입니다.</p>
        </div>
      ) : (
        <form
          className="img-panel-body"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input className="field" autoFocus aria-label="이미지 주소" placeholder="이미지 주소를 붙여 넣으세요" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="btn btn-primary img-panel-main" disabled={!url.trim()}>
            넣기
          </button>
          <p>다른 사이트 이미지는 우리 서버로 옮겨 저장합니다. 원래 글이 지워져도 남습니다.</p>
        </form>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
