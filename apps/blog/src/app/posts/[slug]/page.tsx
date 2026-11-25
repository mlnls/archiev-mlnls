import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/components/JsonLd";
import { Toc } from "@/components/Toc";
import { fetchPost } from "@/lib/api";
import { formatDate } from "@/lib/client";
import { postGraph } from "@/lib/jsonld";
import { extractHeadings, firstImage, plainText, renderMarkdown } from "@/lib/markdown";
import { AUTHOR, postPath, tagPath } from "@/lib/site";

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

export default async function PostPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);
  const post = await getPost(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.body);
  const headings = extractHeadings(html);
  const edited = post.publishedAt && new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 86_400_000;

  return (
    <div className="post-page">
      <JsonLd data={postGraph(post)} />
      <main>
        <article>
          {/* 직접 고른 커버만 화면 끝까지 보여 줍니다. 본문 첫 이미지는 아래 본문에 이미 있습니다 */}
          {post.coverImage ? (
            <div className="post-hero">
              <img src={post.coverImage} alt="" />
            </div>
          ) : null}
          <div className="post-wrap">
            <header className="post-head">
              <div className="post-meta">
                <span>{AUTHOR.name}</span>
                <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
                {edited ? <span>수정 <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></span> : null}
                {post.tags.map((t) => (
                  <Link key={t} href={tagPath(t)}>{t}</Link>
                ))}
              </div>
              <h1>{post.title}</h1>
            </header>
            <div className="post-layout">
              <div className="post-main">
                {/* renderMarkdown이 스크립트, 이벤트 속성, 위험한 링크를 지운 결과입니다 */}
                <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              {headings.length > 1 && <Toc items={headings.map((h) => ({ key: h.id, text: h.text, level: h.level }))} />}
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
