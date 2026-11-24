import { connection } from "next/server";
import { JsonLd } from "@/components/JsonLd";
import { PostList, TagRow } from "@/components/PostList";
import { fetchPosts, fetchTags } from "@/lib/api";
import { siteGraph } from "@/lib/jsonld";
import { SITE_NAME } from "@/lib/site";

export default async function HomePage() {
  await connection();
  const [{ items }, tags] = await Promise.all([fetchPosts(), fetchTags()]);
  return (
    <main className="list-page">
      <JsonLd data={siteGraph()} />
      {/* 제목 줄 없이 글부터 보여 줍니다. 제목은 화면 읽기 프로그램과 검색엔진용으로만 둡니다 */}
      <h1 className="sr-only">{SITE_NAME}</h1>
      <TagRow tags={tags} />
      <PostList posts={items} />
    </main>
  );
}
