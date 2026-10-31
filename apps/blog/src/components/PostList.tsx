import Link from "next/link";
import { formatDate } from "@/lib/client";
import { postPath } from "@/lib/site";
import type { PostSummary } from "@/lib/types";

export function PostList({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) return <p className="empty">아직 올린 글이 없습니다.</p>;
  return (
    <ol className="post-list">
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={postPath(p.slug)} className="post-link">
            <h2>{p.title}</h2>
            {p.summary ? <p>{p.summary}</p> : null}
            <div className="meta">
              <time dateTime={p.publishedAt ?? undefined}>{formatDate(p.publishedAt)}</time> · {p.readingMinutes}분
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TagRow({ tags, current }: { tags: { tag: string; n: number }[]; current?: string }) {
  if (!tags.length) return null;
  return (
    <nav className="tag-row" aria-label="태그">
      <Link href="/" aria-current={current ? undefined : "page"}>전체</Link>
      {tags.map((t) => (
        <Link key={t.tag} href={`/tags/${encodeURIComponent(t.tag)}`} aria-current={current === t.tag ? "page" : undefined}>
          {t.tag} {t.n}
        </Link>
      ))}
    </nav>
  );
}
