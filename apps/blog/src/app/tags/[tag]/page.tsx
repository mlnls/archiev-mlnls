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
  const [{ items, total }, tags] = await Promise.all([fetchPosts({ tag }), fetchTags()]);
  if (!items.length) notFound();
  return (
    <main className="home">
      <header className="tag-head">
        <p>주제</p>
        <h1>{tag}</h1>
        <span>글 {total}편</span>
      </header>
      <div className="list-head">
        <TagRow tags={tags} current={tag} />
      </div>
      <PostList posts={items} />
    </main>
  );
}
