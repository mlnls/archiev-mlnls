/** 에디터의 순수 텍스트 처리. 화면과 분리해 테스트합니다 */

export const parseTags = (text: string) => [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10);

/** 편집기가 문서 끝에 항상 두는 빈 줄이 공개 글에 &nbsp; 문단으로 남지 않게 지웁니다 */
export const cleanMarkdown = (markdown: string) => markdown.replace(/^(?:\s|&nbsp;)+/, "").replace(/(?:\s|&nbsp;)+$/, "");

/** 프로토콜이 없는 주소는 https로 봅니다. javascript: 같은 주소도 이 경로로 무력화됩니다 */
export const normalizeLink = (href: string) => {
  const value = href.trim();
  return /^(?:https?:|mailto:|\/|#)/i.test(value) ? value : `https://${value}`;
};

const MARKDOWN_BLOCK = /^(?:#{1,6} |[-*+] |\d+\. |> |```|\|.+\|\s*$|---\s*$)/m;
const MARKDOWN_INLINE = /\*\*[^*\n]+\*\*|!?\[[^\]\n]*\]\([^)\s]+\)|`[^`\n]+`/;

/** 붙여넣은 글이 마크다운이면 서식으로 풀어서 넣습니다 */
export const looksLikeMarkdown = (text: string) => MARKDOWN_BLOCK.test(text) || MARKDOWN_INLINE.test(text);

export const CODE_LANGUAGES = [
  ["", "일반 텍스트"],
  ["ts", "TypeScript"],
  ["tsx", "TSX"],
  ["js", "JavaScript"],
  ["jsx", "JSX"],
  ["bash", "Bash"],
  ["json", "JSON"],
  ["css", "CSS"],
  ["html", "HTML"],
  ["sql", "SQL"],
  ["python", "Python"],
  ["yaml", "YAML"],
] as const;
