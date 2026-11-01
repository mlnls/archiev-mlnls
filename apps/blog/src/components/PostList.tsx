import Link from "next/link";
import { formatDate } from "@/lib/client";
import { postPath, tagPath } from "@/lib/site";
import type { PostSummary } from "@/lib/types";

export function PostList({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) return <p className="empty">아직 올린 글이 없습니다.</p>;
  return (
    <ol className="post-list">
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={postPath(p.slug)} className="post-link">
            <div className="post-text">
              <h2>{p.title}</h2>
              {p.summary ? <p>{p.summary}</p> : null}
              <div className="meta">
                <time dateTime={p.publishedAt ?? undefined}>{formatDate(p.publishedAt)}</time> · {p.readingMinutes}분
              </div>
            </div>
            {/* 바로 옆 제목이 같은 내용을 말하므로 대체 글을 비웁니다 */}
            {p.coverImage ? <img className="post-cover" src={p.coverImage} alt="" loading="lazy" decoding="async" /> : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TagRow({ tags, current }: { tags: { tag: string; n: number }[]; current?: string }) {
  return (
    <nav className="tag-row" aria-label="주제별로 보기">
      <Link href="/" aria-current={current ? undefined : "page"}>전체</Link>
      {tags.map((t) => (
        <Link key={t.tag} href={tagPath(t.tag)} aria-current={current === t.tag ? "page" : undefined}>
          {t.tag} <span className="tag-count">{t.n}</span>
        </Link>
      ))}
    </nav>
  );
}
