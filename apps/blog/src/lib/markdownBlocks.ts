import { CALLOUTS, CALLOUT_TYPES, type CalloutType } from "./callout";
import type { LinkPreview } from "./linkPreview";

/**
 * 살균이 끝난 HTML 트리를 콜아웃과 링크 카드로 바꿉니다.
 * 살균 뒤에 도는 단계라 여기서 만드는 주소는 직접 검사해야 합니다.
 */
export interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

export type PreviewFetcher = (url: string) => Promise<LinkPreview | null>;

const el = (tagName: string, className: string | null, children: HastNode[] = [], properties: Record<string, unknown> = {}): HastNode => ({
  type: "element",
  tagName,
  properties: className ? { className: [className], ...properties } : properties,
  children,
});
const text = (value: string): HastNode => ({ type: "text", value });
const isBlank = (node: HastNode) => node.type === "text" && !node.value?.trim();
const textOf = (node: HastNode): string => node.value ?? node.children?.map(textOf).join("") ?? "";

const MARKER = new RegExp(`^\\s*\\[!(${CALLOUT_TYPES.join("|")})\\]\\s*`, "i");

/** 첫 줄이 [!tip]인 인용문을 콜아웃으로 바꿉니다 */
function toCallout(quote: HastNode): HastNode | null {
  const blocks = (quote.children ?? []).filter((c) => !isBlank(c));
  const first = blocks[0];
  const head = first?.tagName === "p" ? first.children?.[0] : undefined;
  const match = head?.type === "text" ? MARKER.exec(head.value ?? "") : null;
  if (!first || !head || !match) return null;

  const type = match[1]!.toLowerCase() as CalloutType;
  head.value = head.value!.slice(match[0].length);
  if (!head.value) first.children!.shift();
  // 표시 문구만 있던 문단은 비어 있으므로 남기지 않습니다
  const body = first.children!.every(isBlank) ? blocks.slice(1) : blocks;
  return el("aside", null, [el("span", "callout-icon", [text(CALLOUTS[type].icon)], { ariaHidden: "true" }), el("div", "callout-body", body)], {
    className: ["callout"],
    dataType: type,
    role: "note",
  });
}

/** 글자가 주소 그대로인 링크만 카드로 만듭니다. [문서](주소)처럼 이름을 붙인 링크는 그대로 둡니다 */
function bareUrl(node: HastNode): string | null {
  if (node.tagName !== "a") return null;
  const href = node.properties?.href;
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL(textOf(node).trim()).href === url.href ? url.href : null;
  } catch {
    return null;
  }
}

/** 줄 단위로 나눠서 주소만 있는 줄을 카드 자리로 바꿉니다. 그런 줄이 없으면 null */
function splitLines(children: HastNode[]): (HastNode[] | string)[] | null {
  const lines: HastNode[][] = [[]];
  for (const child of children) {
    if (child.tagName === "br") {
      lines.push([]);
    } else if (child.type === "text" && child.value?.includes("\n")) {
      child.value.split("\n").forEach((part, i) => {
        if (i) lines.push([]);
        if (part) lines[lines.length - 1]!.push(text(part));
      });
    } else {
      lines[lines.length - 1]!.push(child);
    }
  }

  const out: (HastNode[] | string)[] = [];
  let found = false;
  for (const line of lines) {
    const visible = line.filter((n) => !isBlank(n));
    const url = visible.length === 1 ? bareUrl(visible[0]!) : null;
    if (url) {
      found = true;
      out.push(url);
    } else if (visible.length) {
      const prev = out[out.length - 1];
      if (Array.isArray(prev)) prev.push(text("\n"), ...line);
      else out.push(line);
    }
  }
  return found ? out : null;
}

function emptyCard(url: string): HastNode {
  return el("a", "bookmark", [], { href: url, target: "_blank", rel: "noopener noreferrer nofollow" });
}

function fillCard(card: HastNode, url: string, preview: LinkPreview | null) {
  const parsed = new URL(url);
  const address = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  const info: HastNode[] = [el("span", "bookmark-title", [text(preview?.title || parsed.hostname.replace(/^www\./, ""))])];
  if (preview?.description) info.push(el("span", "bookmark-desc", [text(preview.description)]));
  const source: HastNode[] = [el("span", "bookmark-host", [text(address)])];
  if (preview?.icon) source.unshift(el("img", "bookmark-icon", [], { src: preview.icon, alt: "", width: 16, height: 16, loading: "lazy", referrerPolicy: "no-referrer" }));
  info.push(el("span", "bookmark-url", source));
  card.children = [el("span", "bookmark-text", info)];
  if (preview?.image) card.children.push(el("img", "bookmark-image", [], { src: preview.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer" }));
}

function walk(parent: HastNode, cards: { card: HastNode; url: string }[]) {
  const next: HastNode[] = [];
  const card = (url: string) => {
    const node = emptyCard(url);
    cards.push({ card: node, url });
    return node;
  };
  for (const child of parent.children ?? []) {
    if (child.tagName === "blockquote") {
      const callout = toCallout(child);
      if (callout) {
        walk(callout.children![1]!, cards);
        next.push(callout);
        continue;
      }
    }
    if (child.tagName === "p") {
      const lines = splitLines(child.children ?? []);
      if (lines) {
        for (const line of lines) next.push(typeof line === "string" ? card(line) : el("p", null, line));
        continue;
      }
    }
    // 빽빽한 목록은 문단 없이 글자가 바로 들어 있습니다
    if (child.tagName === "li" && !child.children?.some((c) => c.tagName === "p")) {
      const lines = splitLines(child.children ?? []);
      if (lines) child.children = lines.flatMap((line) => (typeof line === "string" ? [card(line)] : line));
    }
    walk(child, cards);
    next.push(child);
  }
  parent.children = next;
}

export async function transformBlocks(tree: HastNode, fetchPreview: PreviewFetcher) {
  const cards: { card: HastNode; url: string }[] = [];
  walk(tree, cards);
  await Promise.all(
    cards.map(async ({ card, url }) => {
      const preview = await fetchPreview(url).catch(() => null);
      fillCard(card, url, preview);
    }),
  );
}
