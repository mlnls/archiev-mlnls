"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, formatDate } from "@/lib/client";
import type { Comment } from "@/lib/types";

const USERNAME_KEY = "comment-username";

function readSavedUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 같은 아이디는 늘 같은 색 동그라미로 보입니다 */
function toneOf(name: string) {
  let sum = 0;
  for (const ch of name) sum += ch.codePointAt(0) ?? 0;
  return sum % 2 ? "amber" : "blue";
}

export function Comments({ slug, initial }: { slug: string; initial: Comment[] }) {
  const [comments, setComments] = useState(initial);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => setUsername(readSavedUsername()), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<Comment>(`/posts/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        json: { username, password, body },
      });
      setComments((list) => [...list, created]);
      setBody("");
      // 아이디만 기억합니다. 비밀번호는 어디에도 저장하지 않습니다.
      try {
        localStorage.setItem(USERNAME_KEY, username);
      } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: Comment) {
    setDeleteError(null);
    try {
      await api(`/comments/${comment.id}`, {
        method: "DELETE",
        json: { username: comment.username, password: deletePassword },
      });
      setComments((list) => list.filter((c) => c.id !== comment.id));
      setDeleting(null);
      setDeletePassword("");
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  }

  return (
    <section id="comments" className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">
        댓글 <b>{comments.length}</b>
      </h2>
      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-head">
                <span className="comment-face" data-tone={toneOf(c.username)} aria-hidden="true">
                  {[...c.username][0]?.toUpperCase()}
                </span>
                <b>{c.username}</b>
                <time dateTime={new Date(c.createdAt).toISOString()}>{formatDate(new Date(c.createdAt).toISOString())}</time>
                <button
                  type="button"
                  className="comment-tool"
                  onClick={() => {
                    setDeleting(deleting === c.id ? null : c.id);
                    setDeletePassword("");
                    setDeleteError(null);
                  }}
                >
                  삭제
                </button>
              </div>
              <p>{c.body}</p>
              {deleting === c.id && (
                <>
                  <form
                    className="comment-delete"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void remove(c);
                    }}
                  >
                    <input
                      className="field"
                      type="password"
                      aria-label="댓글 비밀번호"
                      placeholder="비밀번호"
                      autoComplete="current-password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoFocus
                    />
                    <button className="btn" type="submit">확인</button>
                  </form>
                  {deleteError && <p className="error" role="alert">{deleteError}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={submit}>
        <textarea className="comment-input" aria-label="댓글 내용" placeholder="댓글을 남겨 주세요" required maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="comment-foot">
          <div className="comment-ids">
            <input aria-label="아이디" placeholder="아이디" autoComplete="username" required minLength={2} maxLength={20} value={username} onChange={(e) => setUsername(e.target.value)} />
            <input aria-label="비밀번호" placeholder="비밀번호" type="password" autoComplete="current-password" required minLength={4} maxLength={100} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="comment-send" type="submit" disabled={busy || !body.trim()} aria-label={busy ? "등록 중" : "등록"}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
      <p className="comment-hint">처음 쓰는 아이디는 이 비밀번호로 만들어집니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
