"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client";
import { prepareImage } from "@/lib/prepareImage";

interface PickerOptions {
  onChange: (url: string) => void;
  onError: (message: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}

/** 커버 파일 고르기와 올리기. "커버 추가" 버튼과 커버 이미지가 화면의 다른 자리에 있어서 따로 씁니다 */
export function useCoverPicker({ onChange, onError, onUploadingChange }: PickerOptions) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    onUploadingChange(true);
    try {
      onChange(await uploadImage(await prepareImage(file)));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  };

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void upload(file);
      }}
    />
  );

  return { pick: () => input.current?.click(), uploading, fileInput };
}

/** 공개 글과 같은 자리, 같은 크기(화면 끝까지)로 커버를 보여 줍니다 */
export function CoverImage({ value, uploading, onPick, onRemove }: { value: string; uploading: boolean; onPick: () => void; onRemove: () => void }) {
  return (
    <div className="post-hero cover">
      <img src={value} alt="커버 이미지" />
      <div className="cover-actions">
        <button type="button" disabled={uploading} onClick={onPick}>{uploading ? "올리는 중" : "커버 변경"}</button>
        <button type="button" disabled={uploading} onClick={onRemove}>제거</button>
      </div>
    </div>
  );
}
