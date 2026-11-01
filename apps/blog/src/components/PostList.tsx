import Link from "next/link";
import { formatDate, formatShortDate } from "@/lib/client";
import { postPath, tagPath } from "@/lib/site";
import type { PostSummary } from "@/lib/types";

function Meta({ post }: { post: PostSummary }) {
  return (
    <div className="post-meta">
      {post.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}
      <span>{post.readingMinutes}분</span>
    </div>
  );
}

/** 첫 글은 크게 보여 주고 나머지는 날짜 순서의 목록으로 둡니다 */
export function PostList({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) return <p className="empty">아직 올린 글이 없습니다.</p>;
  const [lead, ...rest] = posts as [PostSummary, ...PostSummary[]];
  return (
    <>
      <Link href={postPath(lead.slug)} className={lead.coverImage ? "lead-link" : "lead-link no-cover"}>
        <div className="lead-text">
          <time className="meta" dateTime={lead.publishedAt ?? undefined}>{formatDate(lead.publishedAt)}</time>
          <h2>{lead.title}</h2>
          {lead.summary ? <p>{lead.summary}</p> : null}
          <Meta post={lead} />
        </div>
        {/* 바로 옆 제목이 같은 내용을 말하므로 대체 글을 비웁니다 */}
        {lead.coverImage ? <img className="lead-cover" src={lead.coverImage} alt="" decoding="async" /> : null}
      </Link>
      {rest.length > 0 && (
        <ol className="post-list">
          {rest.map((p) => (
            <li key={p.id}>
              <Link href={postPath(p.slug)} className="post-link">
                <time className="post-date" dateTime={p.publishedAt ?? undefined}>{formatShortDate(p.publishedAt)}</time>
                <div className="post-text">
                  <h2>{p.title}</h2>
                  {p.summary ? <p>{p.summary}</p> : null}
                  <Meta post={p} />
                </div>
                {p.coverImage ? <img className="post-cover" src={p.coverImage} alt="" loading="lazy" decoding="async" /> : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function TagRow({ tags, current }: { tags: { tag: string; n: number }[]; current?: string }) {
  return (
    <nav className="tag-row" aria-label="주제별로 보기">
      <Link href="/" aria-current={current ? undefined : "page"}>전체</Link>
      {tags.map((t) => (
        <Link key={t.tag} href={tagPath(t.tag)} aria-current={current === t.tag ? "page" : undefined}>
          {t.tag}<span className="tag-count">{t.n}</span>
        </Link>
      ))}
    </nav>
  );
}
