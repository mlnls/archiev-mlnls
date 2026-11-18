"use client";

import type { Editor as TiptapEditor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BodyEditor } from "@/components/editor/BodyEditor";
import { CoverImage, useCoverPicker } from "@/components/editor/CoverField";
import { api, formatDate, slugify } from "@/lib/client";
import { parseTags } from "@/lib/editor";
import { AUTHOR, postPath } from "@/lib/site";
import type { Post } from "@/lib/types";

const DRAFT_KEY = "blog-new-draft";
/** 마지막으로 고친 뒤 이만큼 손을 멈추면 저장합니다 */
const AUTOSAVE_MS = 1200;
const SLUG_TAKEN = "이미 쓰고 있는 주소입니다";

interface Draft {
  title: string;
  slug: string;
  summary: string;
  tags: string;
  cover: string;
  body: string;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const EMPTY: Draft = { title: "", slug: "", summary: "", tags: "", cover: "", body: "" };

function loadLocalDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

const savedTime = (date: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(date);

/**
 * 노션처럼 따로 저장 버튼을 누르지 않아도 됩니다.
 * 비공개 초안은 쓰는 대로 서버에 저장하고, 이미 공개한 글은 "수정 반영"을 눌러야 독자에게 보입니다.
 */
export function Editor({ post }: { post?: Post }) {
  const router = useRouter();
  // RequireAdmin 안에서 브라우저에서만 그려지므로 처음부터 임시 보관본을 읽을 수 있습니다
  const [draft, setDraft] = useState<Draft>(() =>
    post
      ? { title: post.title, slug: post.slug, summary: post.summary, tags: post.tags.join(", "), cover: post.coverImage ?? "", body: post.body }
      : (loadLocalDraft() ?? EMPTY),
  );
  // 공개 전에는 주소가 제목을 따라갑니다. 직접 고쳤거나 이미 공개한 글은 고정합니다
  const [slugTouched, setSlugTouched] = useState(() => (post ? post.published || post.slug !== slugify(post.title) : !!draft.slug && draft.slug !== slugify(draft.title)));
  const [published, setPublished] = useState(post?.published ?? false);
  const [publishedAt, setPublishedAt] = useState(post?.publishedAt ?? null);
  const [postId, setPostId] = useState(post?.id);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const body = useRef<TiptapEditor | null>(null);
  const titleBox = useRef<HTMLTextAreaElement>(null);

  // 저장 중에 들어온 수정도 놓치지 않도록 최신 값과 상태를 ref로 들고 있습니다
  const latest = useRef({ draft, postId, slugTouched, published });
  latest.current = { draft, postId, slugTouched, published };
  const dirty = useRef(false);
  const inflight = useRef<Promise<Post | null> | null>(null);

  // 새 글은 서버에 처음 저장되기 전까지 브라우저에 임시 보관합니다
  useEffect(() => {
    if (postId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, postId]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    dirty.current = true;
    setSaveState("dirty");
  };

  async function persist(nextPublished: boolean, quiet: boolean): Promise<Post | null> {
    // 앞선 저장이 끝난 뒤의 최신 값으로 저장합니다
    while (inflight.current) await inflight.current.catch(() => null);
    const { draft: d, postId: id, slugTouched: fixedSlug } = latest.current;
    if (!d.title.trim() || !d.body.trim()) return null;

    const run = (async () => {
      const base = (fixedSlug && d.slug) || slugify(d.title) || "post";
      for (let attempt = 1; ; attempt++) {
        const slug = attempt === 1 ? base : `${base}-${attempt}`;
        const payload = { title: d.title, slug, summary: d.summary, body: d.body, tags: parseTags(d.tags), coverImage: d.cover || null, published: nextPublished };
        try {
          return id
            ? await api<Post>(`/admin/posts/${id}`, { method: "PUT", json: payload })
            : await api<Post>("/admin/posts", { method: "POST", json: payload });
        } catch (err) {
          // 자동으로 만든 주소가 다른 글과 겹치면 뒤에 숫자를 붙여 봅니다
          if (!fixedSlug && attempt < 5 && (err as Error).message === SLUG_TAKEN) continue;
          throw err;
        }
      }
    })();

    inflight.current = run;
    dirty.current = false;
    setSaveState("saving");
    setError(null);
    try {
      const saved = await run;
      setPublished(saved.published);
      setPublishedAt(saved.publishedAt);
      setDraft((cur) => ({ ...cur, slug: saved.slug }));
      if (saved.published) setSlugTouched(true);
      setSavedAt(new Date());
      setSaveState(dirty.current ? "dirty" : "saved");
      if (!id) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {}
        setPostId(saved.id);
        // 화면을 다시 그리지 않고 주소만 바꿔서 쓰던 자리와 커서를 그대로 둡니다
        window.history.replaceState(null, "", `/write/${saved.id}`);
      }
      if (nextPublished && !quiet) router.push(postPath(saved.slug));
      return saved;
    } catch (err) {
      dirty.current = true;
      setSaveState("error");
      setError((err as Error).message);
      return null;
    } finally {
      inflight.current = null;
    }
  }

  async function save(nextPublished: boolean) {
    setBusy(true);
    try {
      await persist(nextPublished, false);
    } finally {
      setBusy(false);
    }
  }

  const cover = useCoverPicker({ onChange: (url) => update({ cover: url }), onError: setError, onUploadingChange: setCoverUploading });

  // 제목은 공개 글처럼 여러 줄로 감기므로 글자에 맞춰 높이를 늘립니다
  useLayoutEffect(() => {
    const box = titleBox.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [draft.title]);

  const blocked = uploading || coverUploading;
  const filled = !!draft.title.trim() && !!draft.body.trim();
  // 올리는 중에 저장하면 그 이미지가 글에서 빠지므로 끝날 때까지 막습니다
  const canSave = filled && !busy && !blocked;

  useEffect(() => {
    if (published || saveState !== "dirty" || blocked || !filled) return;
    const timer = setTimeout(() => void persist(false, true), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // persist는 ref로 최신 값을 읽으므로 의존성에 넣지 않습니다
  }, [draft, published, saveState, blocked, filled]);

  // 저장되지 않은 수정이 있으면 창을 닫기 전에 묻습니다
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (canSave) void persist(published, true);
    }
  };

  /** 편집기의 focus 명령은 한 프레임 늦게 옮기므로, 곧바로 치는 글자가 제목 칸에 남지 않게 먼저 초점을 옮깁니다 */
  const focusBody = (at: "start" | "end") => {
    const ed = body.current;
    if (!ed) return;
    ed.view.focus();
    ed.commands.focus(at);
  };

  // 글 옆이나 아래의 빈 곳을 눌러도 바로 이어서 쓸 수 있게 합니다
  const onBlankMouseDown = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && !target.classList.contains("editor-layout")) return;
    e.preventDefault();
    focusBody("end");
  };

  const statusText = (() => {
    if (error) return <span className="error">{error}</span>;
    if (blocked) return "이미지 올리는 중";
    if (published) return saveState === "dirty" || saveState === "error" ? "반영하지 않은 수정이 있어요" : saveState === "saved" ? "반영했어요" : "공개 중인 글";
    if (saveState === "saving") return "저장 중";
    if (saveState === "saved" && savedAt) return `저장됨 · ${savedTime(savedAt)}`;
    if (!filled) return "제목과 본문을 쓰면 자동으로 저장돼요";
    return postId ? "비공개 초안" : "곧 저장돼요";
  })();

  return (
    <main className="editor" onKeyDown={onKeyDown} onMouseDown={onBlankMouseDown}>
      <div className="editor-bar">
        <span className="editor-status" role="status">
          {statusText}
        </span>
        <div className="editor-actions">
          {published && (
            <button type="button" className="btn" disabled={!canSave} onClick={() => void save(false)}>
              비공개로 전환
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!canSave || (published && saveState !== "dirty" && saveState !== "error")} onClick={() => void save(true)}>
            {published ? "수정 반영" : "공개하기"}
          </button>
        </div>
      </div>
      {/* 공개 글(.post-head, .post-hero, .post-layout)과 같은 틀이라 쓰는 모습이 그대로 공개됩니다 */}
      <header className="post-head editor-head">
        <input
          className="tags-input"
          aria-label="태그"
          placeholder="태그를 쉼표로 구분해 쓰세요"
          value={draft.tags}
          onChange={(e) => update({ tags: e.target.value })}
        />
        <textarea
          ref={titleBox}
          className="title-input"
          aria-label="제목"
          placeholder="제목 없음"
          rows={1}
          value={draft.title}
          onChange={(e) => {
            const title = e.target.value.replace(/\n/g, " ");
            update({ title, ...(slugTouched ? {} : { slug: slugify(title) }) });
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
              e.preventDefault();
              focusBody("start");
            }
          }}
        />
        <div className="post-meta">
          <span>{AUTHOR.name}</span>
          <span>{publishedAt ? formatDate(publishedAt) : "공개 전"}</span>
          {!draft.cover && (
            <button type="button" className="meta-btn" disabled={cover.uploading} onClick={cover.pick}>
              {cover.uploading ? "커버 올리는 중" : "커버 추가"}
            </button>
          )}
        </div>
        {cover.fileInput}
      </header>
      {draft.cover && <CoverImage value={draft.cover} uploading={cover.uploading} onPick={cover.pick} onRemove={() => update({ cover: "" })} />}
      <div className="post-layout editor-layout">
        <BodyEditor
          initial={draft.body}
          editorRef={body}
          onChange={(markdown) => update({ body: markdown })}
          onError={setError}
          onUploadingChange={setUploading}
        />
        {/* 공개 글에서 목차가 놓이는 자리에 글 속성을 둡니다 */}
        <aside className="editor-props" aria-label="글 속성">
          <label>
            <span>요약</span>
            <textarea rows={2} placeholder="목록과 검색 결과에 보입니다. 비우면 본문 앞부분을 씁니다" maxLength={300} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} />
          </label>
          <label>
            <span>주소</span>
            <input
              placeholder="제목에서 자동으로"
              value={draft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                update({ slug: e.target.value });
              }}
            />
          </label>
        </aside>
      </div>
    </main>
  );
}
