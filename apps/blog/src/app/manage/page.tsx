"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { api, formatShortDate } from "@/lib/client";
import type { PostSummary } from "@/lib/types";

function Manage() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<PostSummary[]>("/admin/posts").then(setPosts).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function remove(p: PostSummary) {
    if (!window.confirm(`"${p.title}" 글을 지울까요?`)) return;
    try {
      await api(`/admin/posts/${p.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    // 홈 목록과 같은 줄 모양. 새 글은 머리줄의 "글쓰기"로 씁니다
    <main className="page">
      <h1 className="sr-only">글 관리</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {posts?.length === 0 && <p className="empty">아직 쓴 글이 없습니다.</p>}
      {posts?.length ? (
        <ol className="rows">
          {posts.map((p) => (
            <li key={p.id}>
              <div className="row">
                <Link href={`/write/${p.id}`} className="row-text">
                  <h2>{p.title}</h2>
                  <div className="post-meta">
                    <span>{p.published ? "공개" : "초안"}</span>
                    {p.published ? <time dateTime={p.publishedAt ?? undefined}>{formatShortDate(p.publishedAt)}</time> : null}
                    {p.tags.length > 0 && <span>{p.tags.join(", ")}</span>}
                  </div>
                </Link>
                <button type="button" className="btn btn-text" onClick={() => void remove(p)}>삭제</button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}

export default function ManagePage() {
  return <RequireAdmin><Manage /></RequireAdmin>;
}
