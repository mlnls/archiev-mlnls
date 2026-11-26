// 파트 메모 편집기. 블로그 글쓰기와 같은 Tiptap으로, 노션처럼 / 메뉴와 #, -, [] 같은 단축 입력을 씁니다.
// 빌드가 esbuild로 묶어 /assets/memo.<해시>.js로 내보내고, 메모 칸을 처음 열 때만 불러옵니다.
import { Editor, Extension } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

const chain = (editor) => editor.chain().focus();

export const SLASH_ITEMS = [
  { id: "text", label: "본문", hint: "", keywords: "text paragraph 문단 글", run: (e) => chain(e).setParagraph().run() },
  { id: "h1", label: "제목 1", hint: "#", keywords: "h1 heading 큰제목", run: (e) => chain(e).setHeading({ level: 1 }).run() },
  { id: "h2", label: "제목 2", hint: "##", keywords: "h2 heading", run: (e) => chain(e).setHeading({ level: 2 }).run() },
  { id: "h3", label: "제목 3", hint: "###", keywords: "h3 heading", run: (e) => chain(e).setHeading({ level: 3 }).run() },
  { id: "ul", label: "목록", hint: "-", keywords: "ul bullet list 글머리 리스트", run: (e) => chain(e).toggleBulletList().run() },
  { id: "ol", label: "번호 목록", hint: "1.", keywords: "ol ordered number list 순서", run: (e) => chain(e).toggleOrderedList().run() },
  { id: "todo", label: "체크리스트", hint: "[]", keywords: "todo task check 할일 할 일", run: (e) => chain(e).toggleTaskList().run() },
  { id: "quote", label: "인용", hint: ">", keywords: "quote blockquote", run: (e) => chain(e).toggleBlockquote().run() },
  { id: "code", label: "코드 블록", hint: "```", keywords: "code 코드", run: (e) => chain(e).toggleCodeBlock().run() },
  { id: "hr", label: "구분선", hint: "---", keywords: "hr divider line 선", run: (e) => chain(e).setHorizontalRule().run() },
];

export function filterSlashItems(query) {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) => item.label.toLowerCase().includes(q) || item.keywords.includes(q));
}

/** 커서 앞 글자가 "/검색어"면 찾아 줍니다. 줄 맨 앞이나 띄어쓰기 뒤에서만 열립니다 */
export function matchSlash(textBefore) {
  const m = /(^|\s)\/([^\s/]*)$/.exec(textBefore);
  return m ? { offset: m.index + m[1].length, query: m[2] } : null;
}

const TOOLS = [
  { id: "bold", label: "굵게", text: "B", run: (e) => chain(e).toggleBold().run() },
  { id: "italic", label: "기울임", text: "I", run: (e) => chain(e).toggleItalic().run() },
  { id: "strike", label: "취소선", text: "S", run: (e) => chain(e).toggleStrike().run() },
  { id: "code", label: "코드", text: "</>", run: (e) => chain(e).toggleCode().run() },
];

/**
 * el 안에 편집기를 띄웁니다.
 * @param {HTMLElement} el
 * @param {{ content?: string, placeholder?: string, onChange?: (html: string) => void }} opts
 */
export function mount(el, { content = "", placeholder = "", onChange } = {}) {
  const doc = el.ownerDocument;
  const menu = doc.createElement("div");
  menu.className = "slash-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  const bar = doc.createElement("div");
  bar.className = "select-bar";
  bar.hidden = true;
  doc.body.append(menu, bar);

  /** @type {{ from: number, to: number, items: typeof SLASH_ITEMS, index: number } | null} */
  let slash = null;

  const closeMenu = () => {
    slash = null;
    menu.hidden = true;
  };
  const apply = (item) => {
    if (!slash) return;
    const { from, to } = slash;
    closeMenu();
    editor.chain().focus().deleteRange({ from, to }).run();
    item.run(editor);
  };
  const renderMenu = () => {
    menu.replaceChildren(
      ...slash.items.map((item, i) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "slash-item";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(i === slash.index));
        const label = doc.createElement("span");
        label.textContent = item.label;
        const hint = doc.createElement("span");
        hint.className = "slash-hint";
        hint.textContent = item.hint;
        b.append(label, hint);
        b.addEventListener("mousedown", (e) => {
          e.preventDefault();
          apply(item);
        });
        return b;
      }),
    );
    menu.hidden = false;
    try {
      const at = editor.view.coordsAtPos(slash.from);
      menu.style.left = `${Math.round(at.left)}px`;
      menu.style.top = `${Math.round(at.bottom + 6)}px`;
    } catch {
      // 화면 배치를 모르는 환경(테스트)에서는 자리만 못 잡습니다
    }
  };
  const updateMenu = () => {
    const { selection } = editor.state;
    const { $from, empty } = selection;
    if (!empty || $from.parent.type.name === "codeBlock") return closeMenu();
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const m = matchSlash(before);
    if (!m) return closeMenu();
    const items = filterSlashItems(m.query);
    if (!items.length) return closeMenu();
    slash = { from: $from.start() + m.offset, to: $from.pos, items, index: Math.min(slash?.index ?? 0, items.length - 1) };
    renderMenu();
  };

  const updateBar = () => {
    const { empty, from, to, $from } = editor.state.selection;
    if (empty || !editor.isFocused || $from.parent.type.name === "codeBlock") {
      bar.hidden = true;
      return;
    }
    bar.replaceChildren(
      ...TOOLS.map((tool) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = `select-tool is-${tool.id}`;
        b.title = tool.label;
        b.textContent = tool.text;
        b.setAttribute("aria-pressed", String(editor.isActive(tool.id)));
        b.addEventListener("mousedown", (e) => {
          e.preventDefault();
          tool.run(editor);
          updateBar();
        });
        return b;
      }),
    );
    bar.hidden = false;
    try {
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      bar.style.left = `${Math.round((a.left + b.right) / 2 - bar.offsetWidth / 2)}px`;
      bar.style.top = `${Math.round(Math.min(a.top, b.top) - bar.offsetHeight - 8)}px`;
    } catch {
      // 화면 배치를 모르는 환경(테스트)에서는 자리만 못 잡습니다
    }
  };

  // 메뉴가 열려 있는 동안 방향키와 Enter는 메뉴가 먼저 받습니다
  const SlashKeys = Extension.create({
    name: "slashKeys",
    priority: 1000,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("slashKeys"),
          props: {
            handleKeyDown: (_view, event) => {
              if (!slash) return false;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const n = slash.items.length;
                slash.index = (slash.index + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
                renderMenu();
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                apply(slash.items[slash.index]);
                return true;
              }
              if (event.key === "Escape") {
                closeMenu();
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });

  const editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      SlashKeys,
    ],
    content,
    onUpdate: () => {
      onChange?.(editor.isEmpty ? "" : editor.getHTML());
      updateMenu();
    },
    onSelectionUpdate: () => {
      updateMenu();
      updateBar();
    },
    onBlur: () => {
      closeMenu();
      bar.hidden = true;
    },
  });

  return {
    editor,
    /** 다른 파트로 옮길 때 내용을 갈아 끼웁니다. 이때는 onChange를 부르지 않습니다 */
    setContent(html) {
      editor.commands.setContent(html || "", { emitUpdate: false });
      closeMenu();
      bar.hidden = true;
    },
    focus() {
      editor.commands.focus("end");
    },
    destroy() {
      editor.destroy();
      menu.remove();
      bar.remove();
    },
  };
}
