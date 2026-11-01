"use client";

import { useEffect, useState } from "react";
import { applyFont, DEFAULT_FONT, FONT_KEY, FONTS } from "@/lib/fonts";

export function FontPicker() {
  const [font, setFont] = useState(DEFAULT_FONT);

  useEffect(() => {
    const saved = document.documentElement.dataset.font;
    if (saved) setFont(saved);
  }, []);

  return (
    <select
      className="font-pick"
      aria-label="글꼴"
      value={font}
      onChange={(e) => {
        const id = e.target.value;
        setFont(id);
        applyFont(id);
        try {
          localStorage.setItem(FONT_KEY, id);
        } catch {
          // 저장을 막아 둔 브라우저에서는 이번 페이지에만 적용됩니다
        }
      }}
    >
      {FONTS.map((f) => (
        <option key={f.id} value={f.id}>{f.label}</option>
      ))}
    </select>
  );
}
