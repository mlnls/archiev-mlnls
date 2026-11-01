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
    <main className="home">
      <JsonLd data={siteGraph()} />
      <h1 className="sr-only">{SITE_NAME}</h1>
      <TagRow tags={tags} />
      <PostList posts={items} />
    </main>
  );
}
