import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Comments } from "@/components/Comments";
import { JsonLd } from "@/components/JsonLd";
import { fetchPost, safely } from "@/lib/api";
import { formatDate } from "@/lib/client";
import { postGraph } from "@/lib/jsonld";
import { extractHeadings, firstImage, plainText, renderMarkdown } from "@/lib/markdown";
import { AUTHOR, postPath, tagPath } from "@/lib/site";
import type { Comment } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

const getPost = cache((slug: string) => fetchPost(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(decodeURIComponent((await params).slug));
  if (!post) return { title: "없는 글", robots: { index: false } };
  const description = post.summary || plainText(post.body);
  const image = post.coverImage ?? firstImage(post.body);
  return {
    title: post.title,
    description,
    authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
    keywords: post.tags,
    alternates: { canonical: postPath(post.slug) },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: postPath(post.slug),
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [AUTHOR.url],
      tags: post.tags,
      images: image ? [image] : undefined,
    },
  };
}

async function fetchComments(slug: string): Promise<Comment[]> {
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
  const res = await fetch(`${base}/posts/${encodeURIComponent(slug)}/comments`, { cache: "no-store" });
  return res.ok ? ((await res.json()) as Comment[]) : [];
}

export default async function PostPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);
  const post = await getPost(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.body);
  const headings = extractHeadings(html);
  // 댓글 API가 실패해도 글은 보여 줍니다
  const comments = await safely(() => fetchComments(slug), []);
  const edited = post.publishedAt && new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 86_400_000;

  return (
    <div className="post-page">
      <JsonLd data={postGraph(post)} />
      <main>
        <article>
          <header className="post-head">
            {post.tags.length > 0 && (
              <div className="post-tags">
                {post.tags.map((t) => (
                  <Link key={t} href={tagPath(t)}>{t}</Link>
                ))}
              </div>
            )}
            <h1>{post.title}</h1>
            <div className="post-meta">
              <span>{AUTHOR.name}</span>
              <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
              {edited ? <span>수정 <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></span> : null}
            </div>
          </header>
          {/* 직접 고른 커버만 보여 줍니다. 본문 첫 이미지는 아래 본문에 이미 있습니다 */}
          {post.coverImage ? <img className="post-hero" src={post.coverImage} alt="" /> : null}
          <div className="post-layout">
            <div>
              {/* renderMarkdown이 스크립트, 이벤트 속성, 위험한 링크를 지운 결과입니다 */}
              <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
              <Comments slug={post.slug} initial={comments} />
            </div>
            {headings.length > 1 && (
              <nav className="toc" aria-label="목차">
                <ul>
                  {headings.map((h) => (
                    <li key={h.id} className={h.level === 3 ? "h3" : undefined}>
                      <a href={`#${h.id}`}>{h.text}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </article>
      </main>
    </div>
  );
}
