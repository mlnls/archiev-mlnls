// @vitest-environment jsdom
// 메모 편집기(Tiptap)를 바로 띄워 저장되는 HTML과 / 메뉴를 확인합니다.
import { afterEach, describe, expect, it } from "vitest";
import { filterSlashItems, matchSlash, mount } from "../src/memo/editor.js";

let ed: ReturnType<typeof mount> | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
  document.body.innerHTML = "";
});

describe("메모 편집기", () => {
  it("/ 뒤의 글자로 블록 종류를 찾습니다", () => {
    expect(matchSlash("메모 /제목")).toEqual({ offset: 3, query: "제목" });
    expect(matchSlash("a/b")).toBeNull();
    expect(filterSlashItems("제목").map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(filterSlashItems("할 일").map((i) => i.id)).toEqual(["todo"]);
  });

  it("고친 내용을 HTML로 알려 주고, 다른 파트의 내용으로 갈아 끼울 때는 알리지 않습니다", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const changes: string[] = [];
    ed = mount(el, { content: "<p>처음</p>", onChange: (html) => changes.push(html) });
    ed.editor.commands.toggleTaskList();
    expect(changes.at(-1)).toContain('data-type="taskList"');
    ed.setContent("<h2>다른 파트</h2>");
    expect(ed.editor.getHTML()).toContain("<h2>다른 파트</h2>");
    const n = changes.length;
    ed.editor.commands.clearContent(true);
    expect(changes).toHaveLength(n + 1);
    expect(changes.at(-1)).toBe("");
  });

  it("/를 치면 메뉴가 열리고, 고르면 그 블록으로 바뀝니다", () => {
    const el = document.createElement("div");
    document.body.append(el);
    ed = mount(el, {});
    ed.editor.commands.insertContent("/체크");
    const menu = document.querySelector(".slash-menu") as HTMLElement;
    expect(menu.hidden).toBe(false);
    const item = menu.querySelector(".slash-item") as HTMLButtonElement;
    expect(item.textContent).toContain("체크리스트");
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(menu.hidden).toBe(true);
    expect(ed.editor.getHTML()).toContain('data-type="taskList"');
    expect(ed.editor.getText()).not.toContain("/체크");
  });
});
