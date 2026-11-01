"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommentAlerts } from "@/components/CommentAlerts";
import { RequireAdmin } from "@/components/RequireAdmin";
import { api, formatDate } from "@/lib/client";
import type { PostSummary } from "@/lib/types";

function Manage() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<PostSummary[]>("/admin/posts").then(setPosts).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function remove(p: PostSummary) {
    if (!window.confirm(`"${p.title}" 글을 지울까요? 댓글도 함께 지워집니다.`)) return;
    try {
      await api(`/admin/posts/${p.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">글 관리</h1>
      <p style={{ marginTop: 16 }}><Link className="btn btn-primary" href="/write">새 글 쓰기</Link></p>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ marginTop: 32, borderTop: "1px solid var(--rule)" }}>
        {posts?.length === 0 && <p className="empty">아직 쓴 글이 없습니다.</p>}
        {posts?.map((p) => (
          <div className="manage-row" key={p.id}>
            <div>
              <Link href={`/write/${p.id}`}>{p.title}</Link>
              <div className="badge">{p.published ? `공개 · ${formatDate(p.publishedAt)}` : "초안"}</div>
            </div>
            <div className="manage-actions">
              <button type="button" className="btn btn-text" onClick={() => void remove(p)}>삭제</button>
            </div>
          </div>
        ))}
      </div>
      <CommentAlerts />
    </main>
  );
}

export default function ManagePage() {
  return <RequireAdmin><Manage /></RequireAdmin>;
}
