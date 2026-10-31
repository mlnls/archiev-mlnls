"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { api, slugify } from "@/lib/client";
import { applySlash, filterCommands, insertLink, parseTags, slashQuery, toggleWrap, type Edit, type SlashCommand } from "@/lib/editor";
import { renderMarkdown } from "@/lib/markdown";
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

/** 입력 중인 줄 바로 아래 위치. 패딩 20px, 줄 높이 14px × 1.75 기준 */
const slashTop = (body: string, cursor: number) => 20 + (body.slice(0, cursor).split("\n").length) * 24.5 + 4;

export function Editor({ post }: { post?: Post }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() =>
    post ? { title: post.title, slug: post.slug, summary: post.summary, tags: post.tags.join(", "), body: post.body } : EMPTY,
  );
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [published, setPublished] = useState(post?.published ?? false);
  const [postId, setPostId] = useState(post?.id);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [mobilePane, setMobilePane] = useState<"source" | "preview">("source");
  const [cursor, setCursor] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const deferredBody = useDeferredValue(draft.body);

  // 새 글은 저장 전까지 브라우저에 임시 보관합니다
  useEffect(() => {
    if (post) return;
    const saved = loadLocalDraft();
    if (saved) {
      setDraft(saved);
      setSlugTouched(!!saved.slug);
    }
  }, [post]);

  useEffect(() => {
    if (postId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, postId]);

  useEffect(() => {
    let alive = true;
    renderMarkdown(deferredBody).then((html) => {
      if (alive) setPreview(html);
    });
    return () => {
      alive = false;
    };
  }, [deferredBody]);

  const slash = useMemo(() => slashQuery(draft.body, cursor), [draft.body, cursor]);
  const commands = useMemo(() => (slash ? filterCommands(slash.query) : []), [slash]);
  const slashOpen = commands.length > 0;
  useEffect(() => setSlashIndex(0), [slash?.query]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // 값이 DOM에 반영된 직후, 다음 입력이 처리되기 전에 커서를 옮깁니다.
  // 프레임을 기다리면 그 사이에 친 글자가 엉뚱한 위치로 들어갑니다.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const el = textarea.current;
    if (!selection || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(selection.start, selection.end);
  }, [draft.body]);

  const applyEdit = (edit: Edit) => {
    pendingSelection.current = { start: edit.start, end: edit.end };
    update({ body: edit.value });
    setCursor(edit.start);
  };

  const runSlash = (cmd: SlashCommand) => {
    if (slash) applyEdit(applySlash(draft.body, slash.lineStart, cursor, cmd));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (slashOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setSlashIndex((i) => (i + delta + commands.length) % commands.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = commands[slashIndex];
        if (cmd) runSlash(cmd);
        return;
      }
      if (e.key === "Escape") {
        setCursor(-1);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key === "b") {
        e.preventDefault();
        applyEdit(toggleWrap(el.value, el.selectionStart, el.selectionEnd, "**"));
      } else if (e.key === "i") {
        e.preventDefault();
        applyEdit(toggleWrap(el.value, el.selectionStart, el.selectionEnd, "*"));
      } else if (e.key === "e") {
        e.preventDefault();
        applyEdit(toggleWrap(el.value, el.selectionStart, el.selectionEnd, "`"));
      } else if (e.key === "k") {
        e.preventDefault();
        applyEdit(insertLink(el.value, el.selectionStart, el.selectionEnd));
      } else if (e.key === "s") {
        e.preventDefault();
        void save(published);
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const start = el.selectionStart;
      const value = `${el.value.slice(0, start)}  ${el.value.slice(el.selectionEnd)}`;
      applyEdit({ value, start: start + 2, end: start + 2 });
    }
  };

  const uploadImage = useCallback(async (file: File) => {
    const el = textarea.current;
    const at = el?.selectionStart ?? 0;
    const placeholder = `![업로드 중: ${file.name}]()`;
    setDraft((d) => ({ ...d, body: d.body.slice(0, at) + placeholder + d.body.slice(at) }));
    try {
      const form = new FormData();
      form.set("file", file);
      const { url } = await api<{ url: string }>("/admin/uploads", { method: "POST", body: form });
      setDraft((d) => ({ ...d, body: d.body.replace(placeholder, `![](${url})`) }));
    } catch (err) {
      setDraft((d) => ({ ...d, body: d.body.replace(placeholder, "") }));
      setError((err as Error).message);
    }
  }, []);

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void uploadImage(file);
    }
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void uploadImage(file);
    }
  };

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

  const canSave = draft.title.trim() && draft.body.trim() && !busy;

  return (
    <main className="editor">
      <div className="editor-bar">
        <span className="editor-status" role="status">
          {error ? <span className="error">{error}</span> : status || (published ? "공개 중인 글" : "비공개 초안")}
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
      <div className="editor-meta">
        <input
          className="title-input"
          aria-label="제목"
          placeholder="제목"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
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
      <div>
        <div className="pane-tabs">
          <button type="button" aria-pressed={mobilePane === "source"} onClick={() => setMobilePane("source")}>쓰기</button>
          <button type="button" aria-pressed={mobilePane === "preview"} onClick={() => setMobilePane("preview")}>미리보기</button>
        </div>
        <div className="editor-panes" style={{ height: "100%" }}>
          <div className="pane" data-hidden={mobilePane !== "source"}>
            <textarea
              ref={textarea}
              className="source"
              aria-label="본문 마크다운"
              placeholder={"마크다운으로 쓰세요. 줄 맨 앞에서 / 를 누르면 블록을 고를 수 있고, 이미지는 붙여넣거나 끌어다 놓으면 올라갑니다."}
              value={draft.body}
              onChange={(e) => {
                update({ body: e.target.value });
                setCursor(e.target.selectionStart);
              }}
              onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDrop={onDrop}
            />
            {slashOpen && (
              <ul className="slash" role="listbox" aria-label="블록 선택" style={{ top: slashTop(draft.body, cursor), left: 24 }}>
                {commands.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={i === slashIndex} onMouseDown={(e) => e.preventDefault()} onClick={() => runSlash(c)}>
                      {c.label}
                      <span>{c.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pane" data-hidden={mobilePane !== "preview"}>
            <div className="preview">
              {draft.body.trim() ? <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="preview-empty">본문을 쓰면 여기에 보입니다.</p>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
