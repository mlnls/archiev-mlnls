"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client";

interface Props {
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}

/** 노션의 커버처럼 제목 위에 넓게 놓습니다. 비워 두면 목록은 본문의 첫 이미지를 씁니다 */
export function CoverField({ value, onChange, onError, onUploadingChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange(busy);
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = () => input.current?.click();

  return (
    <>
      {value ? (
        <div className="cover">
          <img src={value} alt="커버 이미지" />
          <div className="cover-actions">
            <button type="button" disabled={uploading} onClick={pick}>{uploading ? "올리는 중" : "커버 변경"}</button>
            <button type="button" disabled={uploading} onClick={() => onChange("")}>제거</button>
          </div>
        </div>
      ) : (
        <div className="cover-add">
          <button type="button" disabled={uploading} onClick={pick}>{uploading ? "올리는 중" : "커버 추가"}</button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </>
  );
}
