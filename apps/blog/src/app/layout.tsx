import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLinks } from "@/components/AdminLinks";
import { Analytics } from "@/components/Analytics";
import { FontPicker } from "@/components/FontPicker";
import { FONT_INIT_SCRIPT } from "@/lib/fonts";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", url: "/" },
  verification: process.env.NEXT_PUBLIC_GSC_TOKEN ? { google: process.env.NEXT_PUBLIC_GSC_TOKEN } : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        {/* 저장해 둔 글꼴을 첫 화면이 그려지기 전에 적용합니다 */}
        <script dangerouslySetInnerHTML={{ __html: FONT_INIT_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-in">
            <Link href="/" className="wordmark">mlnl</Link>
            <nav aria-label="주요 메뉴">
              <FontPicker />
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
        <Analytics />
      </body>
    </html>
  );
}
