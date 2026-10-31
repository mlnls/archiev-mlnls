import type { Post, PostSummary } from "./types";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** 글 응답은 5분 캐시하고, 글을 저장하면 태그로 바로 비웁니다 */
const CACHE: RequestInit = { next: { revalidate: 300, tags: ["posts"] } };

async function get<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, CACHE);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function fetchPosts(opts: { tag?: string; limit?: number } = {}) {
  const qs = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.tag) qs.set("tag", opts.tag);
  return (await get<{ items: PostSummary[]; total: number }>(`/posts?${qs}`)) ?? { items: [], total: 0 };
}

export const fetchPost = (slug: string) => get<Post>(`/posts/${encodeURIComponent(slug)}`);

export async function fetchTags() {
  return (await get<{ tag: string; n: number }[]>("/tags")) ?? [];
}

/** sitemap처럼 일부 실패해도 나머지를 내보내야 하는 곳에서 씁니다 */
export async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return fallback;
  }
}
