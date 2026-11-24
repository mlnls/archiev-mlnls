"use client";

import { useEffect, useRef, useState } from "react";

/** 목록의 작은 커버. 파일이 없어 못 불러오면 깨진 그림 대신 칸을 비웁니다 */
export function Thumb({ src, eager }: { src: string; eager: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  // 화면이 살아나기 전에 이미 실패한 그림은 onError가 오지 않으므로 한 번 확인합니다.
  // 아직 내려받지 않은 지연 로딩 그림은 currentSrc가 비어 있어 건너뜁니다
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.currentSrc && img.naturalWidth === 0) setBroken(true);
  }, []);
  if (broken) return null;
  // 바로 옆 제목이 같은 내용을 말하므로 대체 글을 비웁니다
  return <img ref={ref} className="row-thumb" src={src} alt="" loading={eager ? undefined : "lazy"} decoding="async" onError={() => setBroken(true)} />;
}
