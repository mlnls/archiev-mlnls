import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface SlashContext {
  editor: Editor;
  pickImage: () => void;
}

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  /** 표 안에서만 보이는 항목 */
  inTable?: boolean;
  run: (ctx: SlashContext) => void;
}

const chain = (editor: Editor) => editor.chain().focus();

export const SLASH_ITEMS: SlashItem[] = [
  { id: "text", label: "본문", hint: "보통 글자", keywords: "text paragraph 문단 글", run: ({ editor }) => chain(editor).setParagraph().run() },
  { id: "h2", label: "제목 2", hint: "##", keywords: "h2 heading", run: ({ editor }) => chain(editor).setHeading({ level: 2 }).run() },
  { id: "h3", label: "제목 3", hint: "###", keywords: "h3 heading", run: ({ editor }) => chain(editor).setHeading({ level: 3 }).run() },
  { id: "ul", label: "목록", hint: "-", keywords: "ul bullet list 글머리 리스트", run: ({ editor }) => chain(editor).toggleBulletList().run() },
  { id: "ol", label: "번호 목록", hint: "1.", keywords: "ol ordered number list 순서", run: ({ editor }) => chain(editor).toggleOrderedList().run() },
  { id: "todo", label: "체크리스트", hint: "[]", keywords: "todo task check 할일 할 일", run: ({ editor }) => chain(editor).toggleTaskList().run() },
  { id: "quote", label: "인용", hint: ">", keywords: "quote blockquote", run: ({ editor }) => chain(editor).toggleBlockquote().run() },
  { id: "callout", label: "콜아웃", hint: "💡", keywords: "callout 강조 메모 팁 주의 경고 노트 note tip warning", run: ({ editor }) => chain(editor).setCallout().run() },
  { id: "code", label: "코드 블록", hint: "```", keywords: "code", run: ({ editor }) => chain(editor).setCodeBlock({ language: "ts" }).run() },
  { id: "table", label: "표", hint: "| |", keywords: "table 테이블", run: ({ editor }) => chain(editor).insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run() },
  { id: "hr", label: "구분선", hint: "---", keywords: "hr divider line 선", run: ({ editor }) => chain(editor).setHorizontalRule().run() },
  { id: "image", label: "이미지", hint: "파일 선택", keywords: "image photo picture 사진 그림", run: ({ pickImage }) => pickImage() },
  { id: "row", label: "아래에 행 추가", hint: "표", keywords: "row 표 줄", inTable: true, run: ({ editor }) => chain(editor).addRowAfter().run() },
  { id: "col", label: "오른쪽에 열 추가", hint: "표", keywords: "column col 표 칸", inTable: true, run: ({ editor }) => chain(editor).addColumnAfter().run() },
  { id: "delrow", label: "행 삭제", hint: "표", keywords: "delete row 표 줄 지우기", inTable: true, run: ({ editor }) => chain(editor).deleteRow().run() },
  { id: "delcol", label: "열 삭제", hint: "표", keywords: "delete column col 표 칸 지우기", inTable: true, run: ({ editor }) => chain(editor).deleteColumn().run() },
  { id: "deltable", label: "표 삭제", hint: "표", keywords: "delete table 표 지우기", inTable: true, run: ({ editor }) => chain(editor).deleteTable().run() },
];

export function filterSlashItems(query: string, inTable: boolean): SlashItem[] {
  const q = query.trim().toLowerCase();
  return SLASH_ITEMS.filter((item) => {
    if (item.inTable && !inTable) return false;
    if (!q) return true;
    return item.label.toLowerCase().includes(q) || item.keywords.includes(q);
  });
}

/** 커서 앞 글자가 "/검색어"면 찾아 줍니다. 줄 맨 앞이나 띄어쓰기 뒤에서만 열립니다 */
export function matchSlash(textBefore: string): { offset: number; query: string } | null {
  const m = /(^|\s)\/([^\s/]*)$/.exec(textBefore);
  return m ? { offset: m.index + m[1]!.length, query: m[2]! } : null;
}

/** 메뉴가 열려 있는 동안 방향키와 Enter는 메뉴가 먼저 받습니다 */
export const slashKeys: { handler: ((event: KeyboardEvent) => boolean) | null } = { handler: null };

export const SlashKeymap = Extension.create({
  name: "slashKeymap",
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("slashKeymap"),
        props: { handleKeyDown: (_view, event) => slashKeys.handler?.(event) ?? false },
      }),
    ];
  },
});
