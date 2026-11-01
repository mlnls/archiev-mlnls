"use client";

import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import { useEffect, useRef, type RefObject } from "react";
import { uploadImage } from "@/lib/client";
import { cleanMarkdown, looksLikeMarkdown } from "@/lib/editor";
import { bodyExtensions } from "@/lib/editorExtensions";
import { CodeBlockView } from "./CodeBlockView";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashKeymap } from "./slash";
import { SlashMenu } from "./SlashMenu";

const EXTENSIONS = [...bodyExtensions(ReactNodeViewRenderer(CodeBlockView)), SlashKeymap];

const imagesOf = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith("image/"));

/**
 * 올리는 사이에 고른 글자나 블록을 덮어쓰지 않도록 선택 영역 뒤에 넣습니다.
 * 넣은 이미지가 선택된 채로 남으면 이어서 칠 때 지워지므로 커서를 그다음 줄로 옮깁니다.
 */
function insertImage(editor: TiptapEditor, src: string) {
  editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "image", attrs: { src } }).run();
  const { selection, doc, tr } = editor.state;
  if (selection instanceof NodeSelection) editor.view.dispatch(tr.setSelection(TextSelection.near(doc.resolve(selection.to), 1)));
}

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
  const fileInput = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onChange, onError, onUploadingChange });
  callbacks.current = { onChange, onError, onUploadingChange };

  const upload = async (files: File[]) => {
    callbacks.current.onUploadingChange(true);
    try {
      for (const file of files) {
        try {
          const url = await uploadImage(file);
          const ed = editorRef.current;
          if (ed) insertImage(ed, url);
        } catch (err) {
          callbacks.current.onError((err as Error).message);
        }
      }
    } finally {
      callbacks.current.onUploadingChange(false);
    }
  };

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
        const images = imagesOf(event.clipboardData?.files);
        if (images.length) {
          void upload(images);
          return true;
        }
        const ed = editorRef.current;
        const clipboard = event.clipboardData;
        const text = clipboard?.getData("text/plain") ?? "";
        // VS Code는 글자 색을 입힌 HTML도 함께 복사하므로 그 HTML은 무시합니다
        const plainSource = !clipboard?.getData("text/html") || clipboard.types.includes("vscode-editor-data");
        if (ed && plainSource && looksLikeMarkdown(text) && !ed.isActive("codeBlock")) {
          ed.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const images = imagesOf(event.dataTransfer?.files);
        if (!images.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
        void upload(images);
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

  return (
    <div className="editor-body" ref={wrap}>
      <EditorContent editor={editor} />
      {editor && (
        <>
          <SlashMenu editor={editor} wrapRef={wrap} pickImage={() => fileInput.current?.click()} />
          <SelectionToolbar editor={editor} wrapRef={wrap} />
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const images = imagesOf(e.target.files);
          e.target.value = "";
          if (images.length) void upload(images);
        }}
      />
    </div>
  );
}
