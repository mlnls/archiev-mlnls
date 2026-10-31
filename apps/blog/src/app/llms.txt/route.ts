import { connection } from "next/server";
import { fetchPosts } from "@/lib/api";
import { buildLlmsTxt } from "@/lib/feeds";

export async function GET() {
  await connection();
  const { items } = await fetchPosts({ limit: 1000 });
  return new Response(buildLlmsTxt(items), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
