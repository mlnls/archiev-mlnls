import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, uploadFile } from "./api";
import { extOf, formatBytes, groupByMonth, makeThumb, pastedFiles } from "./lib";
import type { Item, Listing } from "./types";
import { Viewer } from "./Viewer";

type Filter = "all" | "image" | "video";

interface Upload {
  key: string;
  name: string;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
  abort?: () => void;
}

const PARALLEL = 2;
const ACCEPT = "image/*,video/*";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    api.me().then((r) => setAuthed(r.authed), () => setAuthed(false));
  }, []);
  if (authed === null) return null;
  return authed ? <Archive onLogout={() => setAuthed(false)} /> : <Login onLogin={() => setAuthed(true)} />;
}

export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(username, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인하지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form onSubmit={submit} className="login-card">
        <h1 className="wordmark">archiev</h1>
        <p className="muted">사진과 동영상을 모아 두는 개인 보관함입니다.</p>
        <label>
          아이디
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "확인 중" : "들어가기"}</button>
      </form>
    </main>
  );
}

function Archive({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const queue = useRef<{ key: string; file: File }[]>([]);
  const active = useRef(0);

  const unauthorized = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    },
    [onLogout],
  );

  const reload = useCallback(() => {
    api.list().then(
      (d) => {
        setData(d);
        setLoadError("");
      },
      (e) => {
        unauthorized(e);
        setLoadError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다");
      },
    );
  }, [unauthorized]);

  useEffect(reload, [reload]);

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const pump = useCallback(() => {
    while (active.current < PARALLEL && queue.current.length) {
      const next = queue.current.shift()!;
      active.current++;
      const { promise, abort } = uploadFile(next.file, (p) => patchUpload(next.key, { progress: p }));
      patchUpload(next.key, { state: "uploading", abort });
      promise
        .then(async (item) => {
          // 미리보기는 실패해도 원본은 이미 저장돼 있습니다
          const thumb = await makeThumb(next.file);
          const saved = thumb ? await api.putThumb(item.id, thumb.blob, thumb.width, thumb.height).catch(() => item) : item;
          setData((d) => d && { ...d, items: [saved, ...d.items].sort((a, b) => b.takenAt - a.takenAt), used: d.used + saved.size });
          patchUpload(next.key, { state: "done", progress: 1 });
        })
        .catch((e) => {
          unauthorized(e);
          patchUpload(next.key, { state: "error", error: e instanceof Error ? e.message : "올리지 못했습니다" });
        })
        .finally(() => {
          active.current--;
          pump();
        });
    }
  }, [unauthorized]);

  const addFiles = (files: FileList | File[]) => {
    const accepted = [...files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const skipped = files.length - accepted.length;
    const added = accepted.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file }));
    setUploads((list) => [
      ...list.filter((u) => u.state !== "done"),
      ...added.map(({ key, file }) => ({ key, name: file.name, progress: 0, state: "queued" as const })),
      ...(skipped ? [{ key: `skip-${Date.now()}`, name: `${skipped}개 파일`, progress: 0, state: "error" as const, error: "사진과 동영상만 올릴 수 있습니다" }] : []),
    ]);
    queue.current.push(...added);
    pump();
  };

  // 창 어디에 끌어다 놓거나 붙여 넣어도(⌘V, Ctrl+V) 올라갑니다
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    const paste = (e: ClipboardEvent) => {
      // 메모 입력처럼 글을 쓰는 곳에서는 평소대로 붙여 넣습니다
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      const files = pastedFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
    // addFiles는 ref만 건드리므로 처음 한 번만 붙입니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = data?.items ?? [];
  const visible = useMemo(() => (filter === "all" ? items : items.filter((i) => i.kind === filter)), [items, filter]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const counts = useMemo(
    () => ({ image: items.filter((i) => i.kind === "image").length, video: items.filter((i) => i.kind === "video").length }),
    [items],
  );
  const openIndex = openId ? visible.findIndex((i) => i.id === openId) : -1;

  const logout = async () => {
    await api.logout().catch(() => undefined);
    onLogout();
  };

  const remove = async (item: Item) => {
    try {
      await api.remove(item.id);
      const idx = visible.findIndex((i) => i.id === item.id);
      const next = visible[idx + 1] ?? visible[idx - 1];
      setOpenId(next ? next.id : null);
      setData((d) => d && { ...d, items: d.items.filter((i) => i.id !== item.id), used: d.used - item.size });
    } catch (e) {
      unauthorized(e);
      alert(e instanceof Error ? e.message : "지우지 못했습니다");
    }
  };

  const saveMemo = async (item: Item, memo: string) => {
    const saved = await api.setMemo(item.id, memo);
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === saved.id ? saved : i)) });
  };

  const pending = uploads.filter((u) => u.state === "queued" || u.state === "uploading").length;

  return (
    <>
      <header className="top">
        <span className="wordmark">archiev</span>
        <p className="muted small summary">
          사진 {counts.image.toLocaleString()} · 동영상 {counts.video.toLocaleString()}
          {data && <> · {formatBytes(data.used)} 사용, {formatBytes(data.free)} 남음</>}
        </p>
        <div className="top-actions">
          <button className="primary" onClick={() => fileInput.current?.click()}>올리기</button>
          <button className="ghost" onClick={logout}>로그아웃</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>

      <main className="page">
        <nav className="filters" aria-label="보기">
          {(
            [
              ["all", "전체"],
              ["image", "사진"],
              ["video", "동영상"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={filter === value ? "on" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </nav>

        {loadError && <p className="error">{loadError}</p>}
        {data && !items.length && (
          <button className="empty-drop" onClick={() => fileInput.current?.click()}>
            <strong>아직 보관한 파일이 없습니다</strong>
            <span className="muted">사진이나 동영상을 이 창에 끌어다 놓거나 붙여 넣거나, 눌러서 고르세요.</span>
          </button>
        )}
        {data && items.length > 0 && !visible.length && <p className="empty">이 보기에는 파일이 없습니다.</p>}

        {groups.map((g) => (
          <section key={g.label} className="month">
            <h2>
              {g.label} <span className="muted">{g.items.length}</span>
            </h2>
            <ul className="grid">
              {g.items.map((item) => (
                <li key={item.id}>
                  <button className="tile" onClick={() => setOpenId(item.id)} aria-label={`${item.name} 열기`}>
                    {item.thumb ? (
                      <img src={`/files/${item.id}/thumb`} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="tile-ext">{extOf(item.name) || item.kind}</span>
                    )}
                    {item.kind === "video" && (
                      <span className="tile-badge" aria-hidden>
                        <svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                      </span>
                    )}
                    {item.memo && <span className="tile-memo" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <p>놓으면 올라갑니다</p>
        </div>
      )}

      {uploads.length > 0 && (
        <aside className="tray" aria-live="polite">
          <div className="tray-head">
            <strong>{pending ? `${pending}개 올리는 중` : "올리기 끝"}</strong>
            {!pending && (
              <button className="ghost small" onClick={() => setUploads([])}>
                닫기
              </button>
            )}
          </div>
          <ul>
            {uploads.map((u) => (
              <li key={u.key} className={`tray-row ${u.state}`}>
                <span className="tray-name">{u.name}</span>
                {u.state === "error" ? (
                  <span className="error small">{u.error}</span>
                ) : (
                  <span className="bar" role="progressbar" aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ transform: `scaleX(${u.progress})` }} />
                  </span>
                )}
                {u.state === "uploading" && (
                  <button className="ghost small" onClick={() => u.abort?.()}>
                    취소
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {openIndex >= 0 && (
        <Viewer
          item={visible[openIndex]!}
          hasPrev={openIndex > 0}
          hasNext={openIndex < visible.length - 1}
          onPrev={() => setOpenId(visible[openIndex - 1]!.id)}
          onNext={() => setOpenId(visible[openIndex + 1]!.id)}
          onClose={() => setOpenId(null)}
          onDelete={remove}
          onSaveMemo={saveMemo}
        />
      )}
    </>
  );
}
