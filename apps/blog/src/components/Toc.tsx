"use client";

import { useEffect, useState } from "react";

export interface TocItem {
  /** 공개 글은 제목의 id, 편집기는 문서 안 위치 */
  key: string;
  text: string;
  level: 2 | 3;
}

/** 화면 위에서 이만큼 내려온 선을 지난 마지막 제목을 지금 읽는 제목으로 봅니다 */
const READING_LINE = 120;

const byId = (key: string) => document.getElementById(key);

/**
 * 본문 오른쪽 목차. 지금 읽고 있는 제목만 진하게 보입니다.
 * onSelect가 없으면 #id 링크로, 있으면 버튼으로 그립니다 (편집기).
 */
export function Toc({ items, find = byId, onSelect }: { items: TocItem[]; find?: (key: string) => HTMLElement | null; onSelect?: (key: string) => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = 0;
      items.forEach((item, i) => {
        const top = find(item.key)?.getBoundingClientRect().top;
        if (top !== undefined && top <= READING_LINE) current = i;
      });
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items, find]);

  return (
    <nav className="toc" aria-label="목차">
      <p className="toc-title">목차</p>
      <ul>
        {items.map((h, i) => (
          <li key={h.key} className={h.level === 3 ? "h3" : undefined}>
            {onSelect ? (
              <button type="button" aria-current={i === active ? "location" : undefined} onClick={() => onSelect(h.key)}>
                {h.text}
              </button>
            ) : (
              <a href={`#${h.key}`} aria-current={i === active ? "location" : undefined}>
                {h.text}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
