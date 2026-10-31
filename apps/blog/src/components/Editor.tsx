"use client";

import type { Editor as TiptapEditor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BodyEditor } from "@/components/editor/BodyEditor";
import { api, slugify } from "@/lib/client";
import { parseTags } from "@/lib/editor";
import { postPath } from "@/lib/site";
import type { Post } from "@/lib/types";

const DRAFT_KEY = "blog-new-draft";

interface Draft {
  title: string;
  slug: string;
  summary: string;
  tags: string;
  body: string;
}

const EMPTY: Draft = { title: "", slug: "", summary: "", tags: "", body: "" };

function loadLocalDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

export function Editor({ post }: { post?: Post }) {
  const router = useRouter();
  // RequireAdmin 안에서 브라우저에서만 그려지므로 처음부터 임시 보관본을 읽을 수 있습니다
  const [draft, setDraft] = useState<Draft>(() =>
    post ? { title: post.title, slug: post.slug, summary: post.summary, tags: post.tags.join(", "), body: post.body } : (loadLocalDraft() ?? EMPTY),
  );
  const [slugTouched, setSlugTouched] = useState(!!post || !!draft.slug);
  const [published, setPublished] = useState(post?.published ?? false);
  const [postId, setPostId] = useState(post?.id);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const body = useRef<TiptapEditor | null>(null);

  // 새 글은 저장 전까지 브라우저에 임시 보관합니다
  useEffect(() => {
    if (postId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, postId]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(nextPublished: boolean) {
    setBusy(true);
    setError(null);
    try {
      const slug = draft.slug || slugify(draft.title);
      const payload = { title: draft.title, slug, summary: draft.summary, body: draft.body, tags: parseTags(draft.tags), published: nextPublished };
      const saved = postId
        ? await api<Post>(`/admin/posts/${postId}`, { method: "PUT", json: payload })
        : await api<Post>("/admin/posts", { method: "POST", json: payload });
      setPublished(saved.published);
      update({ slug: saved.slug });
      setSlugTouched(true);
      setStatus("저장했습니다");
      if (!postId) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {}
        setPostId(saved.id);
        router.replace(`/write/${saved.id}`);
      }
      if (nextPublished) router.push(postPath(saved.slug));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 올리는 중에 저장하면 그 이미지가 글에서 빠지므로 끝날 때까지 막습니다
  const canSave = !!draft.title.trim() && !!draft.body.trim() && !busy && !uploading;

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (canSave) void save(published);
    }
  };

  return (
    <main className="editor" onKeyDown={onKeyDown}>
      <div className="editor-bar">
        <span className="editor-status" role="status">
          {error ? <span className="error">{error}</span> : uploading ? "이미지 올리는 중" : status || (published ? "공개 중인 글" : "비공개 초안")}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn" disabled={!canSave} onClick={() => void save(false)}>
            {published ? "비공개로 전환" : "초안 저장"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void save(true)}>
            {published ? "수정 반영" : "공개하기"}
          </button>
        </div>
      </div>
      <div className="editor-doc">
        <div className="editor-meta">
          <input
            className="title-input"
            aria-label="제목"
            placeholder="제목"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                body.current?.commands.focus("start");
              }
            }}
          />
          <div className="prop">
            <label htmlFor="prop-tags">태그</label>
            <input id="prop-tags" placeholder="쉼표로 구분" value={draft.tags} onChange={(e) => update({ tags: e.target.value })} />
          </div>
          <div className="prop">
            <label htmlFor="prop-summary">요약</label>
            <input id="prop-summary" placeholder="검색 결과와 목록에 보입니다. 비우면 본문 앞부분을 씁니다" maxLength={300} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} />
          </div>
          <div className="prop">
            <label htmlFor="prop-slug">주소</label>
            <input
              id="prop-slug"
              placeholder="제목에서 자동으로 만듭니다"
              value={draft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                update({ slug: e.target.value });
              }}
            />
          </div>
        </div>
        <BodyEditor
          initial={draft.body}
          editorRef={body}
          onChange={(markdown) => update({ body: markdown })}
          onError={setError}
          onUploadingChange={setUploading}
        />
      </div>
    </main>
  );
}
