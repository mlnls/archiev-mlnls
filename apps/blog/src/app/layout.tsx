import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLinks } from "@/components/AdminLinks";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", url: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-in">
            <Link href="/" className="wordmark">mlnl</Link>
            <nav aria-label="주요 메뉴">
              <AdminLinks />
              <a href="https://mlnl.site">소개</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="site-footer-in">
            <span>{AUTHOR.name}</span>
            <nav aria-label="외부 링크">
              <a href="/feed.xml">RSS</a>
              <a href="https://github.com/mlnls">GitHub</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
