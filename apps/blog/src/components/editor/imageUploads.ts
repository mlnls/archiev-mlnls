import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { api, uploadImage } from "@/lib/client";
import { isOwnUpload } from "@/lib/imageAttrs";
import { dataUrlToFile, prepareImage } from "@/lib/prepareImage";

/**
 * 노션처럼 이미지를 넣는 순간 바로 보여 주고, 뒤에서 서버로 올립니다.
 *
 * - 파일: 브라우저 안의 blob: 주소로 먼저 그리고, 올리기가 끝나면 서버 주소로 바꿉니다
 * - 붙여 넣은 외부 이미지(노션, 다른 사이트, data:): 서버가 받아 저장한 주소로 바꿉니다
 *
 * 편집기는 한 페이지에 하나라서 상태를 모듈에 둡니다.
 */
const pending = new Set<string>();
const done = new Map<string, string>();
const listeners = new Set<() => void>();
let onError: (message: string) => void = () => {};

const emit = () => listeners.forEach((fn) => fn());

export const uploadState = {
  isPending: (src: string) => pending.has(src),
  isDone: (src: string) => done.has(src),
  count: () => pending.size,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export const setUploadErrorHandler = (fn: (message: string) => void) => {
  onError = fn;
};

/** src가 from인 이미지를 모두 to로 바꾸거나(to=null이면) 지웁니다. 되돌리기 기록에는 남기지 않습니다 */
function swapSrc(state: EditorState, from: string, to: string | null): Transaction | null {
  const hits: { pos: number; size: number; attrs: Record<string, unknown> }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.src === from) hits.push({ pos, size: node.nodeSize, attrs: node.attrs });
  });
  if (!hits.length) return null;
  const tr = state.tr;
  for (const hit of hits.reverse()) {
    if (to) tr.setNodeMarkup(hit.pos, undefined, { ...hit.attrs, src: to });
    else tr.delete(hit.pos, hit.pos + hit.size);
  }
  return tr.setMeta("addToHistory", false);
}

function start(editor: Editor, src: string, work: () => Promise<string>, keepOnFail: boolean) {
  if (pending.has(src) || done.has(src)) return;
  pending.add(src);
  emit();
  work()
    .then((url) => {
      done.set(src, url);
      if (editor.isDestroyed) return;
      const tr = swapSrc(editor.state, src, url);
      if (tr) editor.view.dispatch(tr);
      // 새 이미지가 그려질 시간을 두고 브라우저 메모리를 비웁니다
      if (src.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(src), 30_000);
    })
    .catch((err: Error) => {
      const reason = err.message || "이미지를 올리지 못했습니다";
      onError(keepOnFail ? `이미지를 서버로 옮기지 못해 원래 주소로 둡니다 (${reason})` : reason);
      if (keepOnFail || editor.isDestroyed) return;
      const tr = swapSrc(editor.state, src, null);
      if (tr) editor.view.dispatch(tr);
    })
    .finally(() => {
      pending.delete(src);
      emit();
    });
}

const uploadFile = async (file: File) => uploadImage(await prepareImage(file));

/** 파일을 커서 자리에 넣습니다. 고른 글자나 블록을 덮지 않고 그 뒤에 넣은 다음 커서를 다음 줄로 옮깁니다 */
export function insertImageFiles(editor: Editor, files: File[]) {
  for (const file of files) {
    const src = URL.createObjectURL(file);
    editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "image", attrs: { src } }).run();
    const { selection, doc, tr } = editor.state;
    if (!(selection instanceof TextSelection)) editor.view.dispatch(tr.setSelection(TextSelection.near(doc.resolve(selection.to), 1)));
    start(editor, src, () => uploadFile(file), false);
  }
}

/** 이미지 블록의 "바꾸기": 같은 자리에서 새 파일로 바꿉니다 */
export function replaceImageFile(editor: Editor, pos: number, file: File) {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "image") return;
  const src = URL.createObjectURL(file);
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src }));
  start(editor, src, () => uploadFile(file), false);
}

/** 이미지 주소를 붙여 넣거나 /이미지 에서 링크로 넣을 때 */
export function insertImageUrl(editor: Editor, url: string) {
  editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "image", attrs: { src: url } }).run();
}

const fetchToServer = async (url: string) => (await api<{ url: string }>("/admin/uploads/fetch", { method: "POST", json: { url } })).url;

/** 다른 곳에서 온 이미지인지. 우리 서버 주소를 전체 주소로 붙여 넣은 경우는 짧은 주소로만 바꿉니다 */
function classify(src: string): "own" | "local" | "remote" | "data" | null {
  if (isOwnUpload(src)) return "own";
  if (/^data:image\//i.test(src)) return "data";
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const url = new URL(src);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/uploads/")) return "local";
  } catch {
    return null;
  }
  return "remote";
}

function rehost(editor: Editor, src: string) {
  const kind = classify(src);
  if (kind === "local") {
    const tr = swapSrc(editor.state, src, new URL(src).pathname);
    if (tr) editor.view.dispatch(tr);
  } else if (kind === "data") {
    start(editor, src, async () => uploadFile(await dataUrlToFile(src)), false);
  } else if (kind === "remote") {
    // 서버가 못 가져와도 원래 주소로는 보일 수 있으니 그대로 둡니다
    start(editor, src, () => fetchToServer(src), true);
  }
}

const key = new PluginKey("imageUploads");

export const ImageUploads = Extension.create({
  name: "imageUploads",
  addProseMirrorPlugins() {
    const editor = this.editor;
    /** 처음 열 때 이미 있던 외부 이미지는 글쓴이가 고른 주소라 건드리지 않습니다 */
    const seen = new Set<string>();
    const scan = (state: EditorState, collect: boolean) => {
      state.doc.descendants((node) => {
        if (node.type.name !== "image") return;
        const src = String(node.attrs.src ?? "");
        if (!src || seen.has(src)) return;
        seen.add(src);
        if (!collect) queueMicrotask(() => rehost(editor, src));
      });
    };
    return [
      new Plugin({
        key,
        view(view) {
          scan(view.state, true);
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) scan(v.state, false);
            },
          };
        },
        // 되돌리기로 blob: 이미지가 다시 나타나면 이미 올린 주소로 바로 바꿉니다
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null;
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "image") return;
            const url = done.get(String(node.attrs.src));
            if (!url) return;
            tr ??= state.tr.setMeta("addToHistory", false);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
          });
          return tr;
        },
      }),
    ];
  },
});
