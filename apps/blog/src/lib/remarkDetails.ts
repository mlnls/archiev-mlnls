import { decodeSummary } from "./toggleNode";

/**
 * 본문의 HTML은 공개 글에서 모두 지워지므로, 편집기가 저장한 토글(details)만 골라 블록으로 되살립니다.
 * <details><summary>제목</summary> 와 </details> 사이에 있는 마크다운 블록이 토글 안의 내용이 됩니다.
 */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

const OPEN = /^<details>\s*<summary>([^\n]*?)<\/summary>$/;
const CLOSE = /^<\/details>$/;

function toggle(summary: string, children: MdNode[]): MdNode {
  return {
    type: "toggle",
    data: { hName: "details" },
    children: [{ type: "toggleSummary", data: { hName: "summary" }, children: [{ type: "text", value: summary }] }, ...children],
  };
}

function transform(parent: MdNode) {
  if (!parent.children) return;
  const out: MdNode[] = [];
  const open: { summary: string; children: MdNode[] }[] = [];
  const target = () => (open.length ? open[open.length - 1]!.children : out);

  for (const child of parent.children) {
    transform(child);
    if (child.type === "html") {
      const value = (child.value ?? "").trim();
      const start = OPEN.exec(value);
      if (start) {
        open.push({ summary: decodeSummary(start[1]!.trim()), children: [] });
        continue;
      }
      if (CLOSE.test(value) && open.length) {
        const done = open.pop()!;
        target().push(toggle(done.summary, done.children));
        continue;
      }
    }
    target().push(child);
  }
  // 닫는 태그가 빠졌으면 글 끝까지를 토글 안에 둡니다
  while (open.length) {
    const done = open.pop()!;
    target().push(toggle(done.summary, done.children));
  }
  parent.children = out;
}

export function remarkDetails() {
  return (tree: MdNode) => transform(tree);
}
