export interface FontOption {
  id: string;
  label: string;
  family: string;
  /** 고른 사람만 받도록 고를 때 불러옵니다. 기본 글꼴은 layout이 항상 불러옵니다 */
  href: string | null;
}

export const DEFAULT_FONT = "pretendard";
export const FONT_KEY = "blog-font";

export const FONTS: FontOption[] = [
  { id: "pretendard", label: "Pretendard", family: '"Pretendard Variable"', href: null },
  { id: "wanted", label: "원티드 산스", family: '"Wanted Sans Variable"', href: "https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css" },
  { id: "suit", label: "SUIT", family: '"SUIT Variable"', href: "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2.0.5/fonts/variable/woff2/SUIT-Variable.css" },
  { id: "plex", label: "IBM Plex Sans", family: '"IBM Plex Sans KR"', href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" },
  { id: "noto-serif", label: "노토 세리프", family: '"Noto Serif KR"', href: "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700;900&display=swap" },
  { id: "gowun", label: "고운바탕", family: '"Gowun Batang"', href: "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" },
];

/** 고른 글꼴을 문서에 적용합니다. 첫 화면 전에 도는 스크립트와 고르는 메뉴가 같은 코드를 씁니다 */
function applyFontSource(fonts: FontOption[], id: string) {
  const font = fonts.find((f) => f.id === id) ?? fonts[0]!;
  const root = document.documentElement;
  root.style.setProperty("--font", font.family);
  root.dataset.font = font.id;
  const old = document.getElementById("font-css") as HTMLLinkElement | null;
  if (!font.href) {
    old?.remove();
  } else if (old) {
    old.href = font.href;
  } else {
    const link = document.createElement("link");
    link.id = "font-css";
    link.rel = "stylesheet";
    link.href = font.href;
    document.head.append(link);
  }
}

export const applyFont = (id: string) => applyFontSource(FONTS, id);

export const FONT_INIT_SCRIPT = `try{(${applyFontSource.toString()})(${JSON.stringify(FONTS).replace(/</g, "\\u003c")},localStorage.getItem(${JSON.stringify(FONT_KEY)})||${JSON.stringify(DEFAULT_FONT)})}catch(e){}`;
