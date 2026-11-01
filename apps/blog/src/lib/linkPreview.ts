import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
  icon: string | null;
}

const OK_TTL = 7 * 86_400_000;
const FAIL_TTL = 3_600_000;
const MAX_ENTRIES = 500;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 3000;
const USER_AGENT = "Mozilla/5.0 (compatible; mlnlBlog/1.0; +https://blog.mlnl.site)";

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

/** 서버 안쪽(도커 네트워크, 메타데이터 주소)으로 요청이 새지 않게 막습니다 */
export function isPublicAddress(address: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const ip = mapped ?? address;
  const family = isIP(ip);
  if (!family) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

async function assertFetchable(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
  if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) throw new Error("address");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new Error("address");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string) {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (whole, dec: string, hex: string, name: string) => {
    if (name) return ENTITIES[name.toLowerCase()] ?? whole;
    const code = dec ? Number(dec) : Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function attributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

const httpsUrl = (value: string | undefined, base: string) => {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const clean = (text: string | undefined, max: number) => {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

/** 문서 머리에서 카드에 필요한 값만 읽습니다 */
export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = attrs.content;
  }
  let icon: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    if (/(?:^|\s)icon(?:\s|$)/i.test(attrs.rel ?? "") && attrs.href) {
      icon = attrs.href;
      break;
    }
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? (title ? decodeEntities(title) : ""), 200),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta.description, 300),
    image: httpsUrl(meta["og:image"] ?? meta["twitter:image"], pageUrl),
    icon: httpsUrl(icon ?? "/favicon.ico", pageUrl),
  };
}

/** 머리까지만 읽고 끊습니다. 큰 페이지 때문에 글이 늦게 뜨면 안 됩니다 */
async function readHead(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (Buffer.from(value).includes("</head>")) break;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(chunks);
  const declared = /charset=["']?([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString("latin1"))?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function load(url: string): Promise<LinkPreview | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertFetchable(current);
    // 넘겨주는 주소도 매번 검사하도록 리다이렉트를 직접 따라갑니다
    const res = await fetch(current, { redirect: "manual", signal, cache: "no-store", headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-language": "ko,en;q=0.8" } });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void res.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) {
      void res.body?.cancel();
      return null;
    }
    return parseLinkPreview(await readHead(res), current.href);
  }
  return null;
}

const cache = new Map<string, { until: number; value: Promise<LinkPreview | null> }>();

/** 글을 열 때마다 외부 사이트를 부르지 않도록 메모리에 담아 둡니다. 실패해도 글은 정상으로 뜹니다 */
export function fetchLinkPreview(url: string, now = Date.now()): Promise<LinkPreview | null> {
  const hit = cache.get(url);
  if (hit && hit.until > now) return hit.value;
  if (cache.size >= MAX_ENTRIES) cache.clear();
  const entry = { until: now + OK_TTL, value: Promise.resolve<LinkPreview | null>(null) };
  entry.value = load(url).catch(() => null).then((preview) => {
    if (!preview) entry.until = now + FAIL_TTL;
    return preview;
  });
  cache.set(url, entry);
  return entry.value;
}
