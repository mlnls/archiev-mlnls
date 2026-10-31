import { absoluteUrl, AUTHOR, postPath, SITE_DESCRIPTION, SITE_NAME } from "./site";
import type { PostSummary } from "./types";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildRss(posts: PostSummary[]): string {
  const items = posts
    .map((p) => {
      const url = absoluteUrl(postPath(p.slug));
      return `<item><title>${xml(p.title)}</title><link>${xml(url)}</link><guid>${xml(url)}</guid>${
        p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ""
      }<description>${xml(p.summary)}</description></item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(SITE_NAME)}</title><link>${xml(absoluteUrl("/"))}</link><description>${xml(SITE_DESCRIPTION)}</description><language>ko</language>${items}</channel></rss>`;
}

/** AI 도구가 사이트를 빠르게 파악하도록 하는 요약 (llmstxt.org 형식) */
export function buildLlmsTxt(posts: PostSummary[]): string {
  const lines = posts.map((p) => `- [${p.title}](${absoluteUrl(postPath(p.slug))})${p.summary ? `: ${p.summary}` : ""}`);
  return [`# ${SITE_NAME}`, "", `> ${SITE_DESCRIPTION}`, "", `작성자: ${AUTHOR.name} (${AUTHOR.url})`, "", "## 글", "", ...lines, ""].join("\n");
}
