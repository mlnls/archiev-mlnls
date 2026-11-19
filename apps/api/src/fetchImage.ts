import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * 붙여 넣은 외부 이미지를 우리 서버로 옮길 때 씁니다.
 * 노션이 주는 이미지 주소는 한 시간쯤 지나면 만료되고, 다른 사이트 이미지는 언제 지워질지 모릅니다.
 */
export const FETCH_LIMIT = 10 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10_000;

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

/** 서버 안쪽(도커 네트워크, 클라우드 메타데이터 주소)으로 요청이 새지 않게 막습니다 */
export function isPublicAddress(address: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const ip = mapped ?? address;
  const family = isIP(ip);
  if (!family) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

export class FetchImageError extends Error {}

type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function assertFetchable(url: URL, resolve: Resolve) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchImageError("http, https 주소만 가져올 수 있습니다");
  if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) throw new FetchImageError("가져올 수 없는 주소입니다");
  const addresses = await resolve(url.hostname.replace(/^\[|\]$/g, "")).catch(() => []);
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a))) throw new FetchImageError("가져올 수 없는 주소입니다");
}

/** 노션은 이미지를 notion.so/image/<원래 주소> 로 감싸서 줍니다. 감싼 주소는 로그인이 필요해서 안쪽 주소를 먼저 씁니다 */
export function unwrapNotionImage(raw: string): string[] {
  try {
    const url = new URL(raw);
    if (/(^|\.)notion\.(so|site)$/.test(url.hostname) && url.pathname.startsWith("/image/")) {
      const inner = decodeURIComponent(url.pathname.slice("/image/".length));
      if (/^https?:\/\//.test(inner)) return [inner, raw];
    }
  } catch {}
  return [raw];
}

async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > limit) throw new FetchImageError("10MB 이하 이미지만 가져올 수 있습니다");
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new FetchImageError("10MB 이하 이미지만 가져올 수 있습니다");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function fetchOnce(raw: string, opts: { fetch: typeof fetch; resolve: Resolve; limit: number }): Promise<Uint8Array> {
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // 이동할 때마다 다시 검사합니다. 공개 주소가 내부 주소로 보내는 경우를 막습니다
    await assertFetchable(url, opts.resolve);
    const res = await opts.fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5", "user-agent": "Mozilla/5.0 (compatible; mlnlBlog/1.0)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next) break;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchImageError(`이미지를 가져오지 못했습니다 (${res.status})`);
    }
    return readLimited(res, opts.limit);
  }
  throw new FetchImageError("이미지를 가져오지 못했습니다");
}

export async function fetchImage(
  raw: string,
  opts: { fetch?: typeof fetch; resolve?: Resolve; limit?: number } = {},
): Promise<Uint8Array> {
  const run = { fetch: opts.fetch ?? fetch, resolve: opts.resolve ?? resolveHost, limit: opts.limit ?? FETCH_LIMIT };
  let lastError: unknown = new FetchImageError("이미지를 가져오지 못했습니다");
  for (const candidate of unwrapNotionImage(raw)) {
    try {
      return await fetchOnce(candidate, run);
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError instanceof FetchImageError) throw lastError;
  throw new FetchImageError("이미지를 가져오지 못했습니다");
}
