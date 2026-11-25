"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/** 로그인한 관리자에게만 보입니다. 서버 HTML에는 없어 크롤러와 캐시에 영향을 주지 않습니다 */
export function AdminLinks() {
  const [admin, setAdmin] = useState(false);
  const path = usePathname();
  useEffect(() => {
    api<{ admin: boolean }>("/auth/me").then((r) => setAdmin(r.admin)).catch(() => {});
  }, []);
  if (!admin) return null;
  return (
    <>
      <Link href="/manage" aria-current={path === "/manage" ? "page" : undefined}>글 관리</Link>
      <Link href="/write" aria-current={path === "/write" ? "page" : undefined}>글쓰기</Link>
    </>
  );
}
