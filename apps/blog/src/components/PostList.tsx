import Link from "next/link";
import { formatShortDate } from "@/lib/client";
import { postPath, tagPath } from "@/lib/site";
import type { PostSummary } from "@/lib/types";
import { Thumb } from "./Thumb";

/** 글 한 줄: 제목, 요약, 날짜 · 읽는 시간 · 태그. 커버가 있으면 오른쪽에 작게 */
function Row({ post, eager }: { post: PostSummary; eager: boolean }) {
  return (
    <li>
      <Link href={postPath(post.slug)} className="row">
        <div className="row-text">
          <h2>{post.title}</h2>
          {post.summary ? <p>{post.summary}</p> : null}
          <div className="post-meta">
            <time dateTime={post.publishedAt ?? undefined}>{formatShortDate(post.publishedAt)}</time>
            <span>{post.readingMinutes}분</span>
            {post.tags.length > 0 && <span>{post.tags.join(", ")}</span>}
          </div>
        </div>
        {post.coverImage ? <Thumb src={post.coverImage} eager={eager} /> : null}
      </Link>
    </li>
  );
}

export function PostList({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) return <p className="empty">아직 올린 글이 없어요.</p>;
  return (
    <ol className="rows">
      {posts.map((p, i) => <Row key={p.id} post={p} eager={i < 3} />)}
    </ol>
  );
}

/** 넓은 화면에서는 글 화면의 목차 자리(오른쪽)에, 좁은 화면에서는 목록 위 한 줄로 놓입니다 */
export function TagRow({ tags, current }: { tags: { tag: string; n: number }[]; current?: string }) {
  if (!tags.length) return null;
  return (
    <nav className="topics" aria-label="주제별로 보기">
      <p className="topics-title">주제</p>
      <ul>
        <li>
          <Link href="/" className="topic" aria-current={current ? undefined : "page"}>전체</Link>
        </li>
        {tags.map((t) => (
          <li key={t.tag}>
            <Link href={tagPath(t.tag)} className="topic" aria-current={current === t.tag ? "page" : undefined}>
              {t.tag}<span className="topic-count">{t.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
