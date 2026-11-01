import { defaultSchema, type Schema } from "hast-util-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { fetchLinkPreview } from "./linkPreview";
import { transformBlocks, type HastNode, type PreviewFetcher } from "./markdownBlocks";

/** 코드 강조용 class와 제목 id만 추가로 허용합니다. 스크립트, iframe, on* 속성은 지워집니다 */
const schema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/]],
  },
};

function rehypeBlocks() {
  return async (tree: HastNode, file: { data: { fetchPreview?: PreviewFetcher } }) => {
    await transformBlocks(tree, file.data.fetchPreview ?? fetchLinkPreview);
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeSlug)
  .use(rehypeHighlight, { detect: false, ignoreMissing: true })
  .use(rehypeBlocks as never)
  .use(rehypeStringify);

/** 주소만 있는 줄은 외부 사이트 정보를 읽어 카드로 만듭니다. 테스트에서는 fetchPreview를 바꿔 끼웁니다 */
export async function renderMarkdown(source: string, opts: { fetchPreview?: PreviewFetcher } = {}): Promise<string> {
  return String(await processor.process({ value: source, data: { fetchPreview: opts.fetchPreview } as never }));
}

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** 렌더 결과에서 목차를 뽑습니다 (id가 본문과 항상 같도록) */
export function extractHeadings(html: string): Heading[] {
  const out: Heading[] = [];
  for (const m of html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)) {
    out.push({ level: Number(m[1]) as 2 | 3, id: m[2]!, text: m[3]!.replace(/<[^>]+>/g, "") });
  }
  return out;
}

/** 마크다운을 평문으로 (요약이 비어 있을 때 description으로 사용) */
export function plainText(source: string, max = 150): string {
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*>\s*\[![a-z]+\]/gim, " ")
    // 편집기가 저장할 때 붙이는 이스케이프를 되돌립니다 (snake\_case, R&amp;D)
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~|-]/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** 본문의 첫 이미지 (대표 이미지가 없을 때) */
export function firstImage(source: string): string | null {
  for (const m of source.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    // 노션에서 붙여 넣은 attachment: 주소는 브라우저가 열 수 없습니다
    if (/^(?:https?:\/\/|\/)/.test(m[1]!)) return m[1]!;
  }
  return null;
}
