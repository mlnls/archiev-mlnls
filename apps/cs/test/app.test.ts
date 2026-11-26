// 만든 장 페이지에 app.js를 돌려 파트 넘기기, 학습 완료 조건, 메모 저장을 확인합니다.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { build } from "../scripts/build.mjs";

let out = "";
let appJs = "";

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "cs-app-"));
  await build(out);
  const name = readdirSync(join(out, "assets")).find((f) => f.startsWith("app."))!;
  appJs = readFileSync(join(out, "assets", name), "utf8");
});

afterAll(() => rmSync(out, { recursive: true, force: true }));

/** 페이지를 열고 app.js를 실행합니다. 같은 저장소를 이어 쓰려면 storage를 넘깁니다 */
function open(path: string, hash = "", storage?: Record<string, string>) {
  const html = readFileSync(join(out, path, "index.html"), "utf8").replace(/<script src="[^"]+" defer><\/script>/, "");
  const dom = new JSDOM(html, { url: `https://cs.mlnl.cloud/${path}/${hash}`, runScripts: "outside-only" });
  for (const [k, v] of Object.entries(storage ?? {})) dom.window.localStorage.setItem(k, v);
  dom.window.eval(appJs);
  return dom.window;
}

const current = (w: Window) => w.document.querySelector("section.part.is-current") as HTMLElement;
const box = (sec: HTMLElement) => sec.querySelector(".part-end input[data-key]") as HTMLInputElement;

describe("장 페이지의 파트", () => {
  it("장에 들어가면 먼저 파트 카드 목록을 보여 주고, 카드를 누르면 그 파트 하나만 엽니다", () => {
    const w = open("io");
    const root = w.document.documentElement;
    expect(root.classList.contains("js-parts")).toBe(true);
    expect(root.classList.contains("is-hub")).toBe(true);
    expect(w.document.querySelectorAll("section.part.is-current")).toHaveLength(0);
    const cards = [...w.document.querySelectorAll("[data-part-card]")];
    expect(cards.length).toBe(w.document.querySelectorAll("section.part").length);
    w.location.hash = (cards[1] as HTMLAnchorElement).getAttribute("href")!;
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    expect(root.classList.contains("is-hub")).toBe(false);
    expect(w.document.querySelectorAll("section.part.is-current")).toHaveLength(1);
    expect(current(w).dataset.part).toBe((cards[1] as HTMLElement).dataset.partCard);
    w.location.hash = "#parts";
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    expect(root.classList.contains("is-hub")).toBe(true);
  });

  it("파트의 문제를 다 풀어야 학습 완료를 체크할 수 있고, 체크하면 진도에 들어갑니다", () => {
    const w = open("io", "#part-intro");
    const sec = current(w);
    const quizzes = [...sec.querySelectorAll("[data-quiz]")];
    expect(quizzes.length).toBeGreaterThan(0);
    expect(box(sec).disabled).toBe(true);
    for (const q of quizzes) {
      const option = q.querySelector(".quiz-option") as HTMLButtonElement | null;
      if (option) option.click();
      else {
        (q.querySelector(".quiz-input input") as HTMLInputElement).value = "아무 답";
        q.querySelector("form")!.dispatchEvent(new w.Event("submit", { cancelable: true }));
      }
    }
    expect(box(sec).disabled).toBe(false);
    box(sec).checked = true;
    box(sec).dispatchEvent(new w.Event("change", { bubbles: true }));
    expect(JSON.parse(w.localStorage.getItem("mlnl-cs:progress")!)).toHaveProperty("io:s:intro", 1);
    expect(w.document.querySelector('.stage-head [data-progress] .n')!.textContent).toBe("1");
    const card = w.document.querySelector('[data-part-card="intro"]')!;
    expect(card.classList.contains("is-done")).toBe(true);
    expect(card.querySelector("[data-card-state]")!.textContent).toBe("학습 완료");
  });

  it("주소의 #로 파트를 옮기고, 파트 안의 제목을 가리키면 그 파트를 엽니다", () => {
    const w = open("io", "#part-디렉터리-구조");
    expect(current(w).dataset.part).toBe("디렉터리-구조");
    w.location.hash = "#권한";
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    expect(current(w).querySelector("#권한")).not.toBeNull();
  });

  it("메모 버튼을 누르면 오른쪽 메모 칸이 열리고, 오른쪽 목차는 지금 파트의 제목만 보여 줍니다", () => {
    const w = open("io", "#part-디렉터리-구조");
    const toc = w.document.querySelector("[data-toc-for].is-current") as HTMLElement;
    expect(toc.dataset.tocFor).toBe("디렉터리-구조");
    expect(w.document.querySelectorAll("[data-toc-for].is-current")).toHaveLength(1);
    (w.document.querySelector("section.part.is-current [data-memo-open]") as HTMLButtonElement).click();
    const panel = w.document.querySelector("[data-memo-panel]") as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(w.document.documentElement.classList.contains("is-memo-open")).toBe(true);
    expect(panel.querySelector("[data-memo-title]")!.textContent).toMatch(/^파트 \d+ · 디렉터리 구조$/);
    (panel.querySelector("[data-memo-close]") as HTMLButtonElement).click();
    expect(panel.hidden).toBe(true);
  });

  it("내 메모 페이지는 편집기가 만든 서식만 남기고, 예전 글자 메모도 문단으로 보여 줍니다", () => {
    const notes = {
      "io:디렉터리-구조": '<p>inode와 <strong>이름</strong></p><script>alert(1)</script><img src=x onerror="alert(1)">',
      "io:intro": "첫 줄\n\n둘째 문단",
    };
    const n = open("notes", "", { "mlnl-cs:notes": JSON.stringify(notes) });
    const texts = [...n.document.querySelectorAll(".note-text")];
    expect(texts).toHaveLength(2);
    expect(texts[0]!.querySelectorAll("p")).toHaveLength(2);
    const html = texts[1]!.innerHTML;
    expect(html).toContain("<strong>이름</strong>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
    expect(n.document.querySelector(".note-part")!.getAttribute("href")).toBe(`/io/#part-${encodeURIComponent("intro")}`);
  });

  it("다시 들어오면 카드 목록 위에 마지막으로 본 파트로 가는 이어서 보기가 있습니다", () => {
    const first = open("io", "#part-용어-정리");
    const last = first.localStorage.getItem("mlnl-cs:last")!;
    const again = open("io", "", { "mlnl-cs:last": last });
    const resume = again.document.querySelector("[data-resume]")!;
    expect(resume.getAttribute("href")).toBe("#part-용어-정리");
    expect(resume.textContent).toMatch(/^이어서 보기: 파트 \d+$/);
  });
});
