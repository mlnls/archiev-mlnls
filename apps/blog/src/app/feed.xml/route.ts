import { connection } from "next/server";
import { fetchPosts } from "@/lib/api";
import { buildRss } from "@/lib/feeds";

export async function GET() {
  await connection();
  const { items } = await fetchPosts({ limit: 50 });
  return new Response(buildRss(items), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
