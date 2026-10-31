import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/write", headers: noindex },
      { source: "/write/:path*", headers: noindex },
      { source: "/login", headers: noindex },
      { source: "/manage", headers: noindex },
    ];
  },
  // 로컬 개발에서만 쓰입니다. 운영에서는 Caddy가 /api/* 를 API 컨테이너로 보냅니다.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/:path*` }];
  },
};

export default config;
