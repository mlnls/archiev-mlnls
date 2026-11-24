import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostList, TagRow } from "@/components/PostList";
import { fetchPosts, fetchTags } from "@/lib/api";
import { tagPath } from "@/lib/site";

type Props = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag);
  const { total } = await fetchPosts({ tag });
  if (!total) return { title: "없는 태그", robots: { index: false } };
  return {
    title: `${tag} 글 ${total}개`,
    description: `${tag} 태그가 붙은 글 ${total}개를 모았습니다.`,
    alternates: { canonical: tagPath(tag) },
  };
}

export default async function TagPage({ params }: Props) {
  const tag = decodeURIComponent((await params).tag);
  const [{ items }, tags] = await Promise.all([fetchPosts({ tag }), fetchTags()]);
  if (!items.length) notFound();
  return (
    <main className="list-page">
      {/* 어떤 주제인지는 주제 목록에서 강조된 항목이 알려 줍니다 */}
      <h1 className="sr-only">{tag} 주제의 글</h1>
      <TagRow tags={tags} current={tag} />
      <PostList posts={items} />
    </main>
  );
}
