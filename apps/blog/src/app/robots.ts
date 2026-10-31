import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** 검색엔진과 AI 크롤러 모두 허용합니다. 관리 화면은 X-Robots-Tag: noindex 로 막습니다 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
