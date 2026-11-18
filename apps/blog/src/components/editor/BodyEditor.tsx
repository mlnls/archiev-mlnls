"use client";

import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { cleanMarkdown, looksLikeMarkdown } from "@/lib/editor";
import { bodyExtensions } from "@/lib/editorExtensions";
import { BlockHandle } from "./BlockHandle";
import { CalloutView } from "./CalloutView";
import { CodeBlockView } from "./CodeBlockView";
import { ImagePanel } from "./ImagePanel";
import { ImageUploads, insertImageFiles, insertImageUrl, setUploadErrorHandler, uploadState } from "./imageUploads";
import { ImageView } from "./ImageView";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashKeymap } from "./slash";
import { SlashMenu } from "./SlashMenu";

/** 이미지 블록 안의 버튼, 손잡이, 캡션 칸은 편집기가 아니라 그 요소가 이벤트를 받습니다 */
const imageView = ReactNodeViewRenderer(ImageView, {
  stopEvent: ({ event }) => {
    const target = event.target as HTMLElement | null;
    return !!target?.closest?.(".img-tools, .img-resize, .img-caption, .img-broken");
  },
});

const EXTENSIONS = [
  ...bodyExtensions({ codeBlock: ReactNodeViewRenderer(CodeBlockView), callout: ReactNodeViewRenderer(CalloutView), image: imageView }),
  SlashKeymap,
  ImageUploads,
];

const imagesOf = (files: FileList | File[] | null | undefined) =>
  [...(files ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));

/** 이미지 파일 주소 하나만 붙여 넣으면 링크 대신 이미지로 넣습니다 */
const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:[?#]\S*)?$/i;

interface Props {
  /** 처음 열 때의 마크다운. 이후 값은 편집기가 들고 있습니다 */
  initial: string;
  onChange: (markdown: string) => void;
  onError: (message: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  editorRef: RefObject<TiptapEditor | null>;
}

/** 노션처럼 적으면서 바로 모양이 바뀌는 본문 편집기. 저장은 마크다운으로 합니다 */
export function BodyEditor({ initial, onChange, onError, onUploadingChange, editorRef }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onError, onUploadingChange });
  callbacks.current = { onChange, onError, onUploadingChange };
  const [imagePanel, setImagePanel] = useState<{ top: number; left: number } | null>(null);

  const uploading = useSyncExternalStore(uploadState.subscribe, () => uploadState.count() > 0, () => false);
  useEffect(() => callbacks.current.onUploadingChange(uploading), [uploading]);
  useEffect(() => setUploadErrorHandler((message) => callbacks.current.onError(message)), []);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initial,
    contentType: "markdown",
    // 서버 렌더링과 어긋나지 않도록 브라우저에서 처음 그릴 때 만듭니다
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => callbacks.current.onChange(cleanMarkdown(ed.getMarkdown())),
    editorProps: {
      attributes: { class: "prose", "aria-label": "본문" },
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        const images = imagesOf(event.clipboardData?.files);
        if (ed && images.length) {
          insertImageFiles(ed, images);
          return true;
        }
        const clipboard = event.clipboardData;
        const text = clipboard?.getData("text/plain") ?? "";
        if (ed && IMAGE_URL.test(text.trim()) && !ed.isActive("codeBlock")) {
          insertImageUrl(ed, text.trim());
          return true;
        }
        // VS Code는 글자 색을 입힌 HTML도 함께 복사하므로 그 HTML은 무시합니다
        const plainSource = !clipboard?.getData("text/html") || clipboard.types.includes("vscode-editor-data");
        if (ed && plainSource && looksLikeMarkdown(text) && !ed.isActive("codeBlock")) {
          ed.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        const ed = editorRef.current;
        const images = moved ? [] : imagesOf(event.dataTransfer?.files);
        if (!ed || !images.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
        insertImageFiles(ed, images);
        return true;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  const openImage = () => {
    const box = wrap.current?.getBoundingClientRect();
    if (!editor || !box) return;
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setImagePanel({ top: coords.bottom - box.top + 6, left: Math.max(0, coords.left - box.left) });
  };

  return (
    <div className="editor-body" ref={wrap}>
      <EditorContent editor={editor} />
      {editor && (
        <>
          <SlashMenu editor={editor} wrapRef={wrap} openImage={openImage} />
          <SelectionToolbar editor={editor} wrapRef={wrap} />
          <BlockHandle editor={editor} wrapRef={wrap} />
          {imagePanel && (
            <ImagePanel
              at={imagePanel}
              onFiles={(files) => {
                setImagePanel(null);
                const images = imagesOf(files);
                if (images.length) insertImageFiles(editor, images);
              }}
              onUrl={(url) => {
                setImagePanel(null);
                insertImageUrl(editor, url);
              }}
              onClose={() => {
                setImagePanel(null);
                editor.commands.focus();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
