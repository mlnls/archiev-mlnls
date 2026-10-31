import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { fetchPosts, fetchTags, safely } from "@/lib/api";
import { absoluteUrl, postPath, tagPath } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [{ items }, tags] = await Promise.all([
    safely(() => fetchPosts({ limit: 1000 }), { items: [], total: 0 }),
    safely(fetchTags, []),
  ]);
  return [
    { url: absoluteUrl("/"), ...(items[0] ? { lastModified: items[0].updatedAt } : {}) },
    ...tags.map((t) => ({ url: absoluteUrl(tagPath(t.tag)) })),
    ...items.map((p) => ({ url: absoluteUrl(postPath(p.slug)), lastModified: p.updatedAt })),
  ];
}
