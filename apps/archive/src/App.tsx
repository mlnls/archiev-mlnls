import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, uploadFile } from "./api";
import { extOf, formatBytes, groupByMonth, makeThumb, pastedFiles } from "./lib";
import { NameDialog } from "./NameDialog";
import type { Folder, Item, Listing } from "./types";
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

type Dialog = { kind: "new" } | { kind: "newAndMove"; ids: string[] } | { kind: "rename"; folder: Folder } | null;

const NEW_FOLDER = "__new__";
const OUT_OF_FOLDER = "__none__";

/** 주소의 ?folder= 로 지금 연 폴더를 기억해 뒤로 가기와 새로 고침이 그대로 동작하게 합니다 */
function readFolderParam(): string | null {
  return new URLSearchParams(window.location.search).get("folder");
}

function Archive({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [folderId, setFolderId] = useState<string | null>(readFolderParam);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const queue = useRef<{ key: string; file: File; folderId: string | null }[]>([]);
  const active = useRef(0);
  // 창 전체에 한 번만 붙이는 끌어다 놓기·붙여 넣기 처리기가 지금 폴더를 읽을 수 있게 둡니다
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  const unauthorized = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    },
    [onLogout],
  );

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      unauthorized(e);
      setNotice(e instanceof Error ? e.message : fallback);
    },
    [unauthorized],
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

  useEffect(() => {
    const onPop = () => {
      setFolderId(readFolderParam());
      setOpenId(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const goFolder = (id: string | null) => {
    const url = id ? `?folder=${encodeURIComponent(id)}` : window.location.pathname;
    window.history.pushState(null, "", url);
    setFolderId(id);
    setOpenId(null);
    setSelecting(false);
    setSelected(new Set());
    window.scrollTo({ top: 0 });
  };

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const pump = useCallback(() => {
    while (active.current < PARALLEL && queue.current.length) {
      const next = queue.current.shift()!;
      active.current++;
      const { promise, abort } = uploadFile(next.file, next.folderId, (p) => patchUpload(next.key, { progress: p }));
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
    const target = folderRef.current;
    const added = accepted.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, folderId: target }));
    setUploads((list) => [
      ...list.filter((u) => u.state !== "done"),
      ...added.map(({ key, file }) => ({ key, name: file.name, progress: 0, state: "queued" as const })),
      ...(skipped ? [{ key: `skip-${Date.now()}`, name: `${skipped}개 파일`, progress: 0, state: "error" as const, error: "사진과 동영상만 올릴 수 있습니다" }] : []),
    ]);
    queue.current.push(...added);
    pump();
  };

  // 창 어디에 끌어다 놓거나 붙여 넣어도(⌘V, Ctrl+V) 올라갑니다. 폴더를 열어 두었으면 그 폴더로 들어갑니다
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
    const paste = (e: ClipboardEvent) => {
      // 메모 입력처럼 글을 쓰는 곳에서는 평소대로 붙여 넣습니다
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      const files = pastedFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
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
  const folders = data?.folders ?? [];
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const scoped = useMemo(() => (folderId ? items.filter((i) => i.folderId === folderId) : items), [items, folderId]);
  const visible = useMemo(() => (filter === "all" ? scoped : scoped.filter((i) => i.kind === filter)), [scoped, filter]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const counts = useMemo(
    () => ({ image: items.filter((i) => i.kind === "image").length, video: items.filter((i) => i.kind === "video").length }),
    [items],
  );
  const folderCards = useMemo(
    () =>
      folders.map((f) => {
        const inside = items.filter((i) => i.folderId === f.id);
        return { folder: f, count: inside.length, cover: inside.find((i) => i.thumb) };
      }),
    [folders, items],
  );
  const openIndex = openId ? visible.findIndex((i) => i.id === openId) : -1;

  // 지운 폴더 주소로 들어오면 전체로 돌려보냅니다
  useEffect(() => {
    if (data && folderId && !folder) goFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, folderId, folder]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    onLogout();
  };

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const applyMove = (ids: string[], target: string | null) =>
    setData((d) => d && { ...d, items: d.items.map((i) => (ids.includes(i.id) ? { ...i, folderId: target } : i)) });

  const moveTo = async (ids: string[], target: string | null) => {
    try {
      await api.move(ids, target);
      applyMove(ids, target);
      const name = target ? folders.find((f) => f.id === target)?.name : null;
      setNotice(name ? `${ids.length}개를 "${name}"(으)로 옮겼습니다` : `${ids.length}개를 폴더에서 뺐습니다`);
      stopSelecting();
    } catch (e) {
      fail(e, "옮기지 못했습니다");
    }
  };

  const chooseMove = (ids: string[], value: string) => {
    if (!value) return;
    if (value === NEW_FOLDER) setDialog({ kind: "newAndMove", ids });
    else void moveTo(ids, value === OUT_OF_FOLDER ? null : value);
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length || !confirm(`${ids.length}개 파일을 지울까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api.removeMany(ids);
      const gone = new Set(ids);
      setData(
        (d) =>
          d && {
            ...d,
            items: d.items.filter((i) => !gone.has(i.id)),
            used: d.used - d.items.filter((i) => gone.has(i.id)).reduce((s, i) => s + i.size, 0),
          },
      );
      setNotice(`${ids.length}개를 지웠습니다`);
      stopSelecting();
    } catch (e) {
      fail(e, "지우지 못했습니다");
    }
  };

  const remove = async (item: Item) => {
    try {
      await api.remove(item.id);
      const idx = visible.findIndex((i) => i.id === item.id);
      const next = visible[idx + 1] ?? visible[idx - 1];
      setOpenId(next ? next.id : null);
      setData((d) => d && { ...d, items: d.items.filter((i) => i.id !== item.id), used: d.used - item.size });
    } catch (e) {
      fail(e, "지우지 못했습니다");
    }
  };

  const saveMemo = async (item: Item, memo: string) => {
    const saved = await api.setMemo(item.id, memo);
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === saved.id ? saved : i)) });
  };

  const createFolder = async (name: string) => {
    const created = await api.createFolder(name);
    setData((d) => d && { ...d, folders: [...d.folders, created].sort((a, b) => a.name.localeCompare(b.name, "ko")) });
    return created;
  };

  const deleteFolder = async (f: Folder) => {
    if (!confirm(`"${f.name}" 폴더를 지울까요? 안에 있던 사진과 동영상은 지워지지 않고 폴더 밖으로 나옵니다.`)) return;
    try {
      await api.deleteFolder(f.id);
      setData(
        (d) =>
          d && {
            ...d,
            folders: d.folders.filter((x) => x.id !== f.id),
            items: d.items.map((i) => (i.folderId === f.id ? { ...i, folderId: null } : i)),
          },
      );
      goFolder(null);
    } catch (e) {
      fail(e, "폴더를 지우지 못했습니다");
    }
  };

  const pending = uploads.filter((u) => u.state === "queued" || u.state === "uploading").length;
  const selectedIds = [...selected];

  const moveOptions = (exclude: string | null | undefined) => (
    <>
      {folders
        .filter((f) => f.id !== exclude)
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      <option value={NEW_FOLDER}>새 폴더 만들기</option>
    </>
  );

  return (
    <>
      <header className="top">
        <button className="wordmark home" onClick={() => goFolder(null)}>
          archiev
        </button>
        <p className="muted small summary">
          사진 {counts.image.toLocaleString()} · 동영상 {counts.video.toLocaleString()}
          {data && <> · {formatBytes(data.used)} 사용, {formatBytes(data.free)} 남음</>}
        </p>
        <div className="top-actions">
          <button className="primary" onClick={() => fileInput.current?.click()}>
            {folder ? "이 폴더에 올리기" : "올리기"}
          </button>
          <button className="ghost" onClick={logout}>
            로그아웃
          </button>
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
        {folder ? (
          <div className="folder-head">
            <button className="ghost back" onClick={() => goFolder(null)}>
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                <path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              전체
            </button>
            <h1>
              {folder.name} <span className="muted">{scoped.length}</span>
            </h1>
            <div className="folder-actions">
              <button className="ghost small" onClick={() => setDialog({ kind: "rename", folder })}>
                이름 바꾸기
              </button>
              <button className="ghost small danger" onClick={() => deleteFolder(folder)}>
                폴더 지우기
              </button>
            </div>
          </div>
        ) : (
          data && (
            <section className="folders" aria-label="폴더">
              <div className="section-head">
                <h2>폴더</h2>
                <button className="ghost small" onClick={() => setDialog({ kind: "new" })}>
                  새 폴더
                </button>
              </div>
              {folderCards.length ? (
                <ul className="folder-grid">
                  {folderCards.map(({ folder: f, count, cover }) => (
                    <li key={f.id}>
                      <button className="folder-card" onClick={() => goFolder(f.id)}>
                        <span className="folder-cover">
                          {cover ? (
                            <img src={`/files/${cover.id}/thumb`} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
                              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                            </svg>
                          )}
                        </span>
                        <span className="folder-name">{f.name}</span>
                        <span className="muted small">{count}개</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small folders-empty">폴더를 만들어 사진을 주제별로 모아 보세요. 파일을 고른 뒤 폴더로 옮길 수 있습니다.</p>
              )}
            </section>
          )
        )}

        <div className="toolbar">
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
          {visible.length > 0 &&
            (selecting ? (
              <button className="ghost small" onClick={() => setSelected(new Set(visible.map((i) => i.id)))}>
                모두 선택
              </button>
            ) : (
              <button className="ghost small" onClick={() => setSelecting(true)}>
                선택
              </button>
            ))}
        </div>

        {loadError && <p className="error">{loadError}</p>}
        {data && !scoped.length && (
          <button className="empty-drop" onClick={() => fileInput.current?.click()}>
            <strong>{folder ? "이 폴더는 비어 있습니다" : "아직 보관한 파일이 없습니다"}</strong>
            <span className="muted">
              {folder
                ? "여기에 끌어다 놓거나 붙여 넣으면 이 폴더로 바로 들어갑니다. 전체에서 골라 옮겨도 됩니다."
                : "사진이나 동영상을 이 창에 끌어다 놓거나 붙여 넣거나, 눌러서 고르세요."}
            </span>
          </button>
        )}
        {data && scoped.length > 0 && !visible.length && <p className="empty">이 보기에는 파일이 없습니다.</p>}

        {groups.map((g) => (
          <section key={g.label} className="month">
            <h2>
              {g.label} <span className="muted">{g.items.length}</span>
            </h2>
            <ul className="grid">
              {g.items.map((item) => {
                const isOn = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      className={`tile${selecting ? " selecting" : ""}${isOn ? " on" : ""}`}
                      onClick={() => (selecting ? toggle(item.id) : setOpenId(item.id))}
                      aria-label={selecting ? `${item.name} ${isOn ? "선택 해제" : "선택"}` : `${item.name} 열기`}
                      aria-pressed={selecting ? isOn : undefined}
                    >
                      {item.thumb ? (
                        <img src={`/files/${item.id}/thumb`} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="tile-ext">{extOf(item.name) || item.kind}</span>
                      )}
                      {item.kind === "video" && (
                        <span className="tile-badge" aria-hidden>
                          <svg viewBox="0 0 16 16" width="12" height="12">
                            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                          </svg>
                        </span>
                      )}
                      {item.memo && <span className="tile-memo" aria-hidden />}
                      {selecting && (
                        <span className="tile-check" aria-hidden>
                          {isOn && (
                            <svg viewBox="0 0 16 16" width="12" height="12">
                              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      {selecting && (
        <div className="select-bar" role="toolbar" aria-label="선택한 파일">
          <strong>{selectedIds.length}개 선택</strong>
          <select
            value=""
            disabled={!selectedIds.length}
            onChange={(e) => chooseMove(selectedIds, e.target.value)}
            aria-label="폴더로 옮기기"
          >
            <option value="">폴더로 옮기기</option>
            {moveOptions(folderId)}
          </select>
          {folder && (
            <button className="ghost small" disabled={!selectedIds.length} onClick={() => moveTo(selectedIds, null)}>
              폴더에서 빼기
            </button>
          )}
          <button className="ghost small danger" disabled={!selectedIds.length} onClick={removeSelected}>
            지우기
          </button>
          <button className="ghost small" onClick={stopSelecting}>
            취소
          </button>
        </div>
      )}

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <p>{folder ? `놓으면 "${folder.name}"에 올라갑니다` : "놓으면 올라갑니다"}</p>
        </div>
      )}

      {uploads.length > 0 && (
        <aside className={`tray${selecting ? " raised" : ""}`} aria-live="polite">
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
          folders={folders}
          hasPrev={openIndex > 0}
          hasNext={openIndex < visible.length - 1}
          onPrev={() => setOpenId(visible[openIndex - 1]!.id)}
          onNext={() => setOpenId(visible[openIndex + 1]!.id)}
          onClose={() => setOpenId(null)}
          onDelete={remove}
          onSaveMemo={saveMemo}
          onMove={(item, value) => chooseMove([item.id], value)}
          newFolderValue={NEW_FOLDER}
          outValue={OUT_OF_FOLDER}
        />
      )}

      {dialog?.kind === "new" && (
        <NameDialog
          title="새 폴더"
          confirmLabel="만들기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await createFolder(name);
          }}
        />
      )}
      {dialog?.kind === "newAndMove" && (
        <NameDialog
          title={`새 폴더를 만들어 ${dialog.ids.length}개 옮기기`}
          confirmLabel="만들고 옮기기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const created = await createFolder(name);
            await api.move(dialog.ids, created.id);
            applyMove(dialog.ids, created.id);
            setNotice(`${dialog.ids.length}개를 "${created.name}"(으)로 옮겼습니다`);
            stopSelecting();
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title="폴더 이름 바꾸기"
          initial={dialog.folder.name}
          confirmLabel="바꾸기"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const saved = await api.renameFolder(dialog.folder.id, name);
            setData((d) => d && { ...d, folders: d.folders.map((f) => (f.id === saved.id ? saved : f)).sort((a, b) => a.name.localeCompare(b.name, "ko")) });
          }}
        />
      )}
    </>
  );
}
