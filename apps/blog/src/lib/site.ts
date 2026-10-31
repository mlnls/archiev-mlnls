export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blog.mlnl.site").replace(/\/$/, "");
export const SITE_NAME = "mlnl 블로그";
export const SITE_DESCRIPTION = "프론트엔드 개발자 오승민이 렌더링, 성능, SEO, 배포를 직접 겪으며 정리한 글을 올립니다.";
export const AUTHOR = {
  name: "오승민",
  url: "https://mlnl.site/",
  sameAs: ["https://github.com/mlnls", "https://mlnl.site/"],
};

/** 공식 주소는 이 함수로만 만듭니다 (canonical, sitemap, JSON-LD가 어긋나지 않도록) */
export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
export const postPath = (slug: string) => `/posts/${encodeURIComponent(slug)}`;
export const tagPath = (tag: string) => `/tags/${encodeURIComponent(tag)}`;
