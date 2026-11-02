"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const AMPLITUDE_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_KEY;

/** 글쓰기와 관리 화면은 내 방문이므로 집계하지 않습니다 */
const isPrivatePath = (path: string) => /^\/(?:write|manage|login)(?:\/|$)/.test(path);

let amplitude: Promise<typeof import("@amplitude/analytics-browser")> | null = null;

function startAmplitude(key: string) {
  amplitude ??= import("@amplitude/analytics-browser").then((sdk) => {
    // 입력 내용이 섞이지 않도록 클릭과 폼 자동 수집은 끕니다
    sdk.init(key, undefined, {
      autocapture: { pageViews: true, sessions: true, attribution: true, formInteractions: false, fileDownloads: false, elementInteractions: false },
    });
    return sdk;
  });
  return amplitude;
}

export function Analytics() {
  const pathname = usePathname();
  const hidden = isPrivatePath(pathname);

  useEffect(() => {
    if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = hidden;
    if (!AMPLITUDE_KEY) return;
    if (!hidden) void startAmplitude(AMPLITUDE_KEY).then((sdk) => sdk.setOptOut(false));
    else void amplitude?.then((sdk) => sdk.setOptOut(true));
  }, [hidden]);

  if (!GA_ID || hidden) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});`}
      </Script>
    </>
  );
}
