import Link from "next/link";
import { formatDate } from "@/lib/client";
import { postPath, tagPath } from "@/lib/site";
import type { PostSummary } from "@/lib/types";

const TONES = ["blue", "amber", "green", "violet", "rose"] as const;

/** 커버가 없는 글은 첫 태그를 크게 쓴 색 카드로 보여 줍니다. 같은 태그는 늘 같은 색입니다 */
function toneOf(key: string) {
  let sum = 0;
  for (const ch of key) sum += ch.codePointAt(0) ?? 0;
  return TONES[sum % TONES.length];
}

function Card({ post, featured }: { post: PostSummary; featured?: boolean }) {
  const label = post.tags[0] ?? "mlnl";
  return (
    <li className={featured ? "card is-featured" : "card"}>
      <Link href={postPath(post.slug)} className="card-link">
        <div className="card-art" data-tone={post.coverImage ? undefined : toneOf(label)}>
          {/* 바로 아래 제목이 같은 내용을 말하므로 대체 글을 비웁니다 */}
          {post.coverImage ? (
            <img src={post.coverImage} alt="" loading={featured ? undefined : "lazy"} decoding="async" />
          ) : (
            <span className="card-art-text" aria-hidden="true">{label}</span>
          )}
        </div>
        <div className="card-text">
          {post.tags.length > 0 && (
            <div className="card-tags">
              {post.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}
            </div>
          )}
          <h2>{post.title}</h2>
          {post.summary ? <p>{post.summary}</p> : null}
          <div className="post-meta">
            <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
            <span>{post.readingMinutes}분</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** 가장 최근 글은 두 칸을 차지하고, 나머지는 세 칸 격자로 둡니다 */
export function PostList({ posts }: { posts: PostSummary[] }) {
  if (!posts.length) {
    return (
      <div className="empty-card">
        <p className="empty-title">첫 글을 준비하고 있어요</p>
        <p>RSS로 구독해 두면 새 글이 올라올 때 바로 받아 볼 수 있어요.</p>
        <a className="pill" href="/feed.xml">RSS 구독</a>
      </div>
    );
  }
  const [lead, ...rest] = posts as [PostSummary, ...PostSummary[]];
  // 첫 글이 한 줄을 더 차지하므로 마지막 줄에 남는 칸을 셉니다 (넓은 화면 세 칸, 중간 화면 두 칸).
  // 남는 칸은 구독 카드로 채우고, 남지 않는 폭에서는 CSS가 숨깁니다. 휴대폰에서는 늘 맨 끝에 둡니다
  const fill3 = (3 - ((posts.length + 1) % 3)) % 3;
  const fill2 = rest.length % 2;
  return (
    <ol className={rest.length ? "cards" : "cards is-single"}>
      <Card post={lead} featured />
      {rest.map((p) => <Card key={p.id} post={p} />)}
      {rest.length > 0 && (
        <li className={`card-cta fill3-${fill3} fill2-${fill2}`}>
          <p className="cta-title">새 글 소식 받기</p>
          <p>RSS로 구독해 두면 새 글이 올라올 때 바로 받아 볼 수 있어요.</p>
          <div className="cta-links">
            <a className="pill is-dark" href="/feed.xml">RSS 구독</a>
            <a className="pill" href="https://github.com/mlnls">GitHub</a>
          </div>
        </li>
      )}
    </ol>
  );
}

export function TagRow({ tags, current }: { tags: { tag: string; n: number }[]; current?: string }) {
  if (!tags.length) return null;
  return (
    <nav className="chips" aria-label="주제별로 보기">
      <Link href="/" className="chip" aria-current={current ? undefined : "page"}>전체</Link>
      {tags.map((t) => (
        <Link key={t.tag} href={tagPath(t.tag)} className="chip" aria-current={current === t.tag ? "page" : undefined}>
          {t.tag}<span className="chip-count">{t.n}</span>
        </Link>
      ))}
    </nav>
  );
}
