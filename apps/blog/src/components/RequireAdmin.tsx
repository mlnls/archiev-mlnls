"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api<{ admin: boolean }>("/auth/me")
      .then((r) => (r.admin ? setOk(true) : router.replace("/login")))
      .catch(() => router.replace("/login"));
  }, [router]);
  return ok ? <>{children}</> : null;
}
