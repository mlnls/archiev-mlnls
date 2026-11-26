// content/로 정적 사이트를 만듭니다. 의존성 없이 Node 기본 기능만 씁니다.
//   node scripts/build.mjs            → dist/
// 주소는 mlnl.site 기준으로 적고, 이미지를 만들 때 Dockerfile이 실제 도메인으로 바꿉니다.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { book, parts, sources, upcoming } from "../content/book.mjs";
import { esc, extractTerms, inline, parseFrontmatter, plain, render, termId } from "./markdown.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** 블로그와 같은 글꼴 고르기. 고른 글꼴은 이 사이트의 localStorage에 남습니다 */
const FONTS = [
  { id: "pretendard", label: "Pretendard", family: '"Pretendard Variable"', href: null },
  { id: "wanted", label: "원티드 산스", family: '"Wanted Sans Variable"', href: "https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css" },
  { id: "suit", label: "SUIT", family: '"SUIT Variable"', href: "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2.0.5/fonts/variable/woff2/SUIT-Variable.css" },
  { id: "plex", label: "IBM Plex Sans", family: '"IBM Plex Sans KR"', href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" },
  { id: "noto-serif", label: "노토 세리프", family: '"Noto Serif KR"', href: "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700;900&display=swap" },
  { id: "gowun", label: "고운바탕", family: '"Gowun Batang"', href: "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" },
];
function applyFontSource(fonts, id) {
  const font = fonts.find((f) => f.id === id) ?? fonts[0];
  const root = document.documentElement;
  root.style.setProperty("--font", font.family);
  root.dataset.font = font.id;
  const old = document.getElementById("font-css");
  if (!font.href) old?.remove();
  else if (old) old.href = font.href;
  else {
    const link = document.createElement("link");
    link.id = "font-css";
    link.rel = "stylesheet";
    link.href = font.href;
    document.head.append(link);
  }
}
const FONT_INIT = `try{window.__applyFont=function(id){(${applyFontSource.toString()})(${JSON.stringify(FONTS).replace(/</g, "\\u003c")},id)};window.__applyFont(localStorage.getItem("mlnl-cs:font")||"pretendard")}catch(e){}`;
export const SITE = "https://cs.mlnl.site";
const BLOG = "https://blog.mlnl.site";
const CV = "https://mlnl.site/";
const GITHUB = "https://github.com/mlnls";

const num = (i) => String(i + 1).padStart(2, "0");
const pathOf = (ch) => `/${ch.slug}/`;
/** 실습 수 + 다 읽음 하나 */
const countOf = (ch) => ch.parts.length;
/** 한국어 기술 글을 1분에 450자쯤 읽는다고 봅니다 */
const minutesOf = (html) => Math.max(1, Math.round(html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "").length / 450));

const FIGURES = join(ROOT, "content", "figures");
const RASTER = /\.(png|jpe?g|webp|avif)$/;

/** content/figures/의 그림들. SVG는 글자로 읽어 두고, 사진은 이름만 기억했다가 dist/figures/로 복사합니다 */
async function loadFigures(dir = FIGURES) {
  const figures = new Map();
  for (const f of await readdir(dir).catch(() => [])) {
    if (f.endsWith(".svg")) figures.set(f, { svg: await readFile(join(dir, f), "utf8") });
    else if (RASTER.test(f)) figures.set(f, {});
  }
  return figures;
}

const unescapeHtml = (s) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const textLength = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").length;
/** 본문 파트 하나의 목표 길이(글자). 이만큼 모이면 파트를 닫습니다 */
const PART_TARGET = 2500;

/** 장 본문을 공부 단위인 파트로 나눕니다.
 *  1. ## 제목마다 절로 자릅니다. 첫 제목 앞은 "들어가며"(intro) 절입니다.
 *  2. 본문 절들은 PART_TARGET 글자쯤 되도록 이어서 한 파트로 묶습니다.
 *  3. "다시 장면으로"부터는 정리 / 용어 정리 / 직접 해보기 / 장 전체 문제와 스스로 점검(더 읽을거리 포함)으로 묶습니다.
 *  파트의 id는 첫 절의 id라서, 학습 완료 기록("<slug>:s:<id>")은 그 제목을 바꾸지 않는 한 그대로 남습니다 */
export function splitParts(html) {
  const secs = [];
  for (const chunk of html.split(/(?=<h2 id=")/)) {
    const m = /^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/.exec(chunk);
    if (!m) {
      if (chunk.trim()) secs.push({ id: "intro", titleHtml: "들어가며", text: "들어가며", html: `<h2 id="intro">들어가며</h2>\n${chunk}` });
      continue;
    }
    secs.push({ id: m[1], titleHtml: m[2].replace(/<a [^>]*>|<\/a>/g, ""), text: unescapeHtml(m[2]).trim(), html: chunk });
  }
  const at = (name) => secs.findIndex((x) => x.text.startsWith(name));
  let tail = at("다시 장면으로");
  if (tail < 0) tail = [at("프론트엔드와 이어지는 곳"), at("용어 정리")].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? secs.length;
  const groups = [];
  let cur = null;
  for (const sec of secs.slice(0, tail)) {
    if (!cur) groups.push((cur = [sec]));
    else cur.push(sec);
    if (cur.reduce((n, x) => n + textLength(x.html), 0) >= PART_TARGET) cur = null;
  }
  // 마지막 본문 파트가 너무 짧으면 앞 파트에 붙입니다
  const size = (g) => g.reduce((n, x) => n + textLength(x.html), 0);
  if (groups.length > 1 && size(groups.at(-1)) < PART_TARGET / 3) groups.at(-2).push(...groups.pop());
  // 끝부분: 정리, 용어 정리, 직접 해보기, 문제와 점검
  const rest = secs.slice(tail);
  const terms = rest.findIndex((x) => x.text === "용어 정리");
  const wrap = terms < 0 ? rest : rest.slice(0, terms);
  if (wrap.length) groups.push(wrap);
  for (const x of terms < 0 ? [] : rest.slice(terms)) {
    const last = groups.at(-1);
    if (["스스로 점검", "더 읽을거리"].includes(x.text) && last[0].text === "장 전체 문제") last.push(x);
    else if (x.text === "더 읽을거리" || (x.text === "스스로 점검" && !["용어 정리", "직접 해보기"].includes(last[0].text))) last.push(x);
    else groups.push([x]);
  }
  return groups.map((g) => ({
    id: g[0].id,
    titleHtml: g[0].titleHtml,
    text: g[0].text,
    subs: g.slice(1).filter((x) => x.text !== "더 읽을거리").map((x) => ({ id: x.id, titleHtml: x.titleHtml })),
    html: g.map((x) => x.html).join(""),
    side: g.every((x) => x.text.startsWith("곁가지")),
    heads: [...g.map((x) => x.html).join("").matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
      .filter((m) => unescapeHtml(m[3]).trim() !== "더 읽을거리")
      .map((m) => ({ level: Number(m[1]), id: m[2], html: m[3].replace(/<a [^>]*>|<\/a>/g, "") })),
    quizzes: g.reduce((n, x) => n + (x.html.match(/ data-quiz="/g) || []).length, 0),
  }));
}

/** 차례 순서대로 장을 읽고, 모든 장의 용어를 모은 뒤 본문을 그립니다 */
/** draft: 아직 쓰지 않은 장은 건너뛰고, 없는 용어는 링크 없이 씁니다 (로컬 미리보기용).
 *  draft가 아니어도 upcoming에 적은 장은 파일이 없으면 건너뛰고 soon으로 돌려줍니다 */
export async function loadBook(dir = join(ROOT, "content", "chapters"), { draft = false } = {}) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const present = new Set(files.map((f) => f.slice(0, -3)));
  const all = parts.flatMap((p, pi) => p.chapters.map((slug) => ({ slug, part: pi })));
  const skip = (o) => !present.has(o.slug) && (draft || o.slug in upcoming);
  const order = all.filter((o) => !skip(o));
  const soon = all.filter((o) => skip(o) && o.slug in upcoming).map((o) => ({ ...o, summary: upcoming[o.slug] }));
  const listed = new Set(order.map((o) => o.slug));
  for (const f of files) if (!listed.has(f.slice(0, -3))) throw new Error(`차례(book.mjs)에 없는 장입니다: ${f}`);

  const chapters = [];
  for (const { slug, part } of order) {
    const src = await readFile(join(dir, `${slug}.md`), "utf8").catch(() => {
      throw new Error(`장 파일이 없습니다: content/chapters/${slug}.md`);
    });
    const { meta, body } = parseFrontmatter(src);
    if (!meta.title || !meta.summary) throw new Error(`${slug}: 머리말에 title과 summary가 필요합니다`);
    chapters.push({ slug, part, title: meta.title, summary: meta.summary, body, terms: extractTerms(body) });
  }

  const terms = new Map();
  for (const ch of chapters) {
    for (const t of ch.terms) {
      if (terms.has(t.key)) throw new Error(`용어 "${t.key}"를 ${terms.get(t.key).chapter.slug}와 ${ch.slug}에서 두 번 정리했습니다`);
      terms.set(t.key, { ...t, id: termId(t.key), chapter: ch });
    }
  }
  const ids = new Map();
  for (const t of terms.values()) {
    if (ids.has(t.id)) throw new Error(`용어 "${ids.get(t.id)}"와 "${t.key}"의 주소(${t.id})가 같습니다`);
    ids.set(t.id, t.key);
  }

  const missing = new Set();
  const figures = await loadFigures(join(dir, "..", "figures"));
  for (const [i, ch] of chapters.entries()) {
    ch.index = i;
    ch.refs = new Set();
    Object.assign(ch, render(ch.body, { slug: ch.slug, terms, refs: ch.refs, draft, missing, figures }));
    ch.minutes = minutesOf(ch.html);
    ch.parts = splitParts(ch.html);
  }
  return { chapters, terms, missing, figures, soon };
}

function page({ title, description, path, body, assets }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:locale" content="ko_KR">
  <meta name="theme-color" content="#f6f6f8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b0b0e" media="(prefers-color-scheme: dark)">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="${assets.css}">
  <script>${FONT_INIT}</script>
  <script src="${assets.js}" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="site-header-in">
      <a class="wordmark" href="/">mlnl<span>cs</span></a>
      <nav aria-label="주요 메뉴">
        <select class="font-pick" aria-label="글꼴" data-font-pick>${FONTS.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join("")}</select>
        <a href="/terms/">용어 사전</a>
        <a href="/notes/">내 메모</a>
        <a href="${BLOG}">블로그</a>
        <a href="${CV}">소개</a>
      </nav>
    </div>
  </header>
${body}
  <footer class="site-footer">
    <div class="site-footer-in">
      <span>오승민</span>
      <nav aria-label="외부 링크">
        <a href="${BLOG}">블로그</a>
        <a href="${GITHUB}">GitHub</a>
      </nav>
    </div>
  </footer>
</body>
</html>
`;
}

function progress(scope, total, label) {
  return `<span class="progress" data-progress="${esc(scope)}" data-total="${total}" aria-label="${esc(label)}"><span class="progress-bar"><span></span></span><span class="progress-text"><span class="n">0</span>/${total}</span></span>`;
}

function indexPage({ chapters, terms, soon }, assets) {
  const total = chapters.reduce((n, c) => n + countOf(c), 0);
  const minutes = chapters.reduce((n, c) => n + c.minutes, 0);
  const sections = parts
    .map((p, pi) => {
      const rows = chapters
        .filter((c) => c.part === pi)
        .map(
          (c) => `        <li>
          <a class="row" href="${pathOf(c)}">
            <span class="row-num">${num(c.index)}</span>
            <div class="row-text">
              <h2>${esc(c.title)}</h2>
              <p>${inline(c.summary, { slug: c.slug, terms })}</p>
              <div class="meta"><span>${c.minutes}분</span><span>파트 ${c.parts.length}</span>${c.quiz.length ? `<span>문제 ${c.quiz.length}</span>` : ""}<span>용어 ${c.terms.length}</span></div>
            </div>
            ${progress(`${c.slug}:s`, countOf(c), `${c.title} 학습한 파트`)}
          </a>
        </li>`,
        )
        .concat(
          soon
            .filter((c) => c.part === pi)
            .map(
              (c) => `        <li>
          <div class="row is-soon">
            <span class="row-num">${num(chapters.length + soon.indexOf(c))}</span>
            <div class="row-text">
              <h2>준비 중인 장</h2>
              <p>${esc(c.summary)}</p>
            </div>
          </div>
        </li>`,
            ),
        )
        .join("\n");
      return `    <section class="part" aria-labelledby="part-${pi + 1}">
      <p class="part-title" id="part-${pi + 1}">${pi + 1}부 · ${esc(p.title)}</p>
      <ol class="rows">
${rows}
      </ol>
    </section>`;
    })
    .join("\n");
  const repoRows = sources
    .map(
      (s) => `        <li><a href="https://github.com/${esc(s.repo)}" rel="noopener">${esc(s.repo)}</a><span class="stars">★ ${s.stars.toLocaleString("en-US")}</span><p>${esc(s.used)}</p></li>`,
    )
    .join("\n");
  const body = `  <main class="list-page">
    <h1 class="sr-only">${esc(book.title)}</h1>
    <div class="parts">
${sections}
      <section class="sources" aria-labelledby="sources-title">
        <p class="part-title" id="sources-title">차례를 짤 때 참고한 저장소</p>
        <p class="sources-text">GitHub에서 별이 많은 컴퓨터 기초·면접·시스템 저장소의 목차를 열어 보고, 거기서 다루는 주제가 이 책 어딘가에 들어 있도록 했습니다. 별 수는 2026년 11월 기준입니다.</p>
        <ul class="repos">
${repoRows}
        </ul>
      </section>
    </div>
    <aside class="side" aria-label="책 안내">
      <p class="side-title">${esc(book.title)}</p>
      <p class="side-text">${inline(book.summary, { terms })}</p>
      <p class="side-meta">${parts.length}부 ${chapters.length}장 · 용어 ${terms.size}개 · 약 ${Math.round(minutes / 60)}시간</p>
      <p class="side-link"><a href="/terms/">용어 사전 보기</a></p>
      <p class="side-title">전체 진도율 (학습한 파트)</p>
      ${progress("*", total, "전체 진도율")}
      <p class="side-title">이렇게 읽어요</p>
      <ul class="tips">
${book.tips.map((t) => `        <li>${inline(t, { terms })}</li>`).join("\n")}
      </ul>
      <button type="button" class="reset" data-reset>진행 기록 지우기</button>
    </aside>
  </main>`;
  return page({ title: `${book.title} | mlnl`, description: book.description, path: "/", body, assets });
}

function chapterPage(ch, { chapters, terms }, assets) {
  const prev = chapters[ch.index - 1];
  const next = chapters[ch.index + 1];
  const secs = ch.parts;
  const chapterLink = (c, dir) =>
    c
      ? `<a${dir === "next" ? ' class="next"' : ""} href="${pathOf(c)}"><span>${dir === "next" ? "다음 장" : "이전 장"}</span>${num(c.index)} ${esc(c.title)}</a>`
      : `<a${dir === "next" ? ' class="next"' : ""} href="/"><span>${dir === "next" ? "끝" : "처음"}</span>차례로 돌아가기</a>`;
  const sections = secs
    .map((p, i) => {
      const before = secs[i - 1];
      const after = secs[i + 1];
      const back = before ? `<a href="#part-${before.id}"><span>이전 파트</span>${before.titleHtml}</a>` : chapterLink(prev, "prev");
      const fwd = after ? `<a class="next" href="#part-${after.id}"><span>다음 파트</span>${after.titleHtml}</a>` : chapterLink(next, "next");
      return `          <section class="part" id="part-${p.id}" data-part="${p.id}">
            <p class="part-step"><a class="back-hub" href="#parts">← 파트 목록</a><span>파트 ${i + 1} / ${secs.length}${p.side ? " · 곁가지" : ""}${p.quizzes ? ` · 문제 ${p.quizzes}` : ""}</span><button type="button" class="memo-open" data-memo-open>메모</button></p>
            <div class="prose">
${p.html}
            </div>
            <div class="part-end">
              <label class="finish"><input type="checkbox" data-key="${esc(`${ch.slug}:s:${p.id}`)}"><span>이 파트 학습 완료</span></label>
              <p class="part-hint" data-part-hint></p>
              <nav class="stage-nav" aria-label="파트 넘기기">
                ${back}
                ${fwd}
              </nav>
            </div>
          </section>`;
    })
    .join("\n");
  const cards = secs
    .map(
      (p, i) => `            <li><a class="part-card" href="#part-${p.id}" data-part-card="${p.id}">
              <span class="card-top"><span class="card-num">파트 ${i + 1}</span><span class="card-state" data-card-state></span></span>
              <span class="card-title">${p.titleHtml}</span>
              ${p.subs.length ? `<span class="card-subs">${p.subs.map((x) => x.titleHtml).join(" · ")}</span>` : ""}
              <span class="card-meta">약 ${minutesOf(p.html)}분${p.quizzes ? ` · 문제 ${p.quizzes}` : ""}${p.side ? " · 곁가지" : ""}</span>
            </a></li>`,
    )
    .join("\n");
  const list = secs
    .map(
      (p) =>
        `              <li><a href="#part-${p.id}" data-part-link="${p.id}"><span class="mark" aria-hidden="true"></span><span class="t">${p.titleHtml}</span></a>${
          p.subs.length ? `<ul class="parts-sub">${p.subs.map((x) => `<li><a href="#${x.id}">${x.titleHtml}</a></li>`).join("")}</ul>` : ""
        }</li>`,
    )
    .join("\n");
  const body = `  <main class="page">
    <article>
      <header class="stage-head">
        <p class="stage-meta"><a href="/">차례</a><span>${ch.part + 1}부 ${esc(parts[ch.part].title)}</span><span>${num(ch.index)}장</span><span>파트 ${secs.length}개</span><span>읽는 데 ${ch.minutes}분</span></p>
        <h1>${esc(ch.title)}</h1>
        <p class="stage-goal">${inline(ch.summary, { slug: ch.slug, terms })}</p>
        ${progress(`${ch.slug}:s`, secs.length, "이 장에서 학습한 파트")}
      </header>
      <div class="stage-layout">
        <div class="stage-main">
          <section class="hub" id="parts" aria-labelledby="hub-title">
            <div class="hub-head">
              <h2 id="hub-title">이 장의 파트 ${secs.length}개</h2>
              <a class="hub-resume" href="#part-${secs[0].id}" data-resume>파트 1부터 시작하기</a>
            </div>
            <p class="hub-text">파트를 골라 들어갑니다. 파트의 문제를 다 풀고 맨 아래 "이 파트 학습 완료"를 체크하면 진도에 들어갑니다.</p>
            <ol class="part-cards">
${cards}
            </ol>
          </section>
${sections}
        </div>
        <aside class="study" aria-label="이 파트의 차례">
          <p class="study-step"><a href="#parts">파트 목록</a></p>
${secs
  .map(
    (p, i) => `          <div class="toc-part" data-toc-for="${p.id}">
            <p class="toc-title">파트 ${i + 1} · ${p.titleHtml}</p>
            <ul>${p.heads.map((h) => `<li class="h${h.level}"><a href="#${h.id}">${h.html}</a></li>`).join("")}</ul>
          </div>`,
  )
  .join("\n")}
          <button type="button" class="memo-open is-side" data-memo-open>이 파트 메모</button>
        </aside>
      </div>
    </article>
    <aside class="memo-panel" data-memo-panel data-src="${assets.memo}" aria-label="메모" hidden>
      <div class="memo-head">
        <div>
          <p class="memo-kicker">메모</p>
          <p class="memo-title" data-memo-title></p>
        </div>
        <button type="button" class="memo-close" data-memo-close aria-label="메모 닫기">×</button>
      </div>
      <div class="memo-body prose" data-memo-editor></div>
      <p class="memo-foot"><span data-memo-status>이 브라우저에만 저장됩니다</span><a href="/notes/">내 메모 모아 보기</a></p>
    </aside>
  </main>`;
  return page({ title: `${num(ch.index)} ${ch.title} | ${book.title}`, description: plain(ch.summary), path: pathOf(ch), body, assets });
}

function notesPage({ chapters }, assets) {
  const map = chapters.map((c) => ({ slug: c.slug, num: num(c.index), title: c.title, parts: c.parts.map((p) => ({ id: p.id, title: p.text })) }));
  const body = `  <main class="page notes-page">
    <header class="stage-head">
      <p class="stage-meta"><a href="/">차례</a><span>내 메모</span></p>
      <h1>내 메모</h1>
      <p class="stage-goal">파트마다 남긴 메모를 장 순서대로 모았습니다. 메모는 이 브라우저에만 저장되어, 다른 기기나 브라우저에서는 보이지 않습니다.</p>
    </header>
    <div class="notes" data-notes>
      <p class="notes-empty">아직 남긴 메모가 없습니다. 각 장의 오른쪽 칸에서 파트마다 메모를 남길 수 있습니다.</p>
    </div>
    <script type="application/json" id="book-map">${JSON.stringify(map).replace(/</g, "\\u003c")}</script>
  </main>`;
  return page({ title: `내 메모 | ${book.title}`, description: "파트마다 남긴 메모를 모아 봅니다.", path: "/notes/", body, assets });
}

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const DOUBLE = { ㄲ: "ㄱ", ㄸ: "ㄷ", ㅃ: "ㅂ", ㅆ: "ㅅ", ㅉ: "ㅈ" };
const GROUPS = [..."ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
/** 용어 사전에서 묶을 첫 글자: 한글은 초성, 영문은 대문자, 나머지는 # */
export function groupOf(key) {
  const c = key.codePointAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const cho = CHO[Math.floor((c - 0xac00) / 588)];
    return DOUBLE[cho] ?? cho;
  }
  return /[a-z]/i.test(key[0]) ? key[0].toUpperCase() : "#";
}

function termsPage({ chapters, terms }, assets) {
  const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
  const byGroup = new Map(GROUPS.map((g) => [g, []]));
  for (const t of terms.values()) byGroup.get(groupOf(t.key)).push(t);
  const groups = [...byGroup].filter(([, list]) => list.length);
  const sections = groups
    .map(([g, list]) => {
      const rows = list
        .sort((a, b) => collator.compare(a.key, b.key))
        .map((t) => {
          const ctx = { slug: "terms", terms };
          const search = `${t.name} ${plain(t.def)}`.toLowerCase();
          return `          <div class="term-row" id="${t.id}" data-search="${esc(search)}"><dt>${inline(t.name, ctx)}</dt><dd>${inline(t.def, ctx)} <a class="term-from" href="${pathOf(t.chapter)}#${t.id}">${num(t.chapter.index)} ${esc(t.chapter.title)}</a></dd></div>`;
        })
        .join("\n");
      const label = g === "#" ? "0–9" : g;
      return `        <section class="term-group" id="g-${g === "#" ? "etc" : g}" data-group>
          <h2>${label}</h2>
          <dl class="terms">
${rows}
          </dl>
        </section>`;
    })
    .join("\n");
  const body = `  <main class="page">
    <header class="stage-head">
      <p class="stage-meta"><a href="/">차례</a><span>용어 ${terms.size}개</span><span>${chapters.length}장에서 모음</span></p>
      <h1>용어 사전</h1>
      <p class="stage-goal">이 책에 나온 용어를 모두 모았습니다. 뜻 끝의 장 이름을 누르면 그 용어를 처음 설명한 곳으로 갑니다.</p>
      <input class="filter" type="search" placeholder="용어나 뜻으로 찾기" aria-label="용어 찾기" data-filter>
    </header>
    <div class="stage-layout">
      <div class="stage-main">
${sections}
        <p class="empty" data-empty hidden>찾는 용어가 없습니다.</p>
      </div>
      <nav class="toc toc-letters" aria-label="첫 글자">
        <p class="toc-title">첫 글자</p>
        <ul>
${groups.map(([g]) => `          <li><a href="#g-${g === "#" ? "etc" : g}">${g === "#" ? "0–9" : g}</a></li>`).join("\n")}
        </ul>
      </nav>
    </div>
  </main>`;
  return page({ title: `용어 사전 | ${book.title}`, description: `${book.title}에 나온 용어 ${terms.size}개를 모은 사전입니다.`, path: "/terms/", body, assets });
}

/** 내용이 바뀌면 이름도 바뀌므로 nginx가 /assets/에 거는 1년 캐시를 그대로 씁니다 */
async function asset(out, file, ext) {
  const text = await readFile(join(ROOT, "src", file), "utf8");
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 10);
  const name = `/assets/${file.replace(/\.\w+$/, "")}.${hash}.${ext}`;
  await writeFile(join(out, name), text);
  return name;
}

/** 메모 편집기(Tiptap)를 한 파일로 묶습니다. 메모 칸을 처음 열 때만 불러옵니다 */
async function bundleMemo(out) {
  const { build: bundle } = await import("esbuild");
  const result = await bundle({ entryPoints: [join(ROOT, "src", "memo", "editor.js")], bundle: true, format: "esm", minify: true, write: false, target: "es2022", legalComments: "none" });
  const text = result.outputFiles[0].text;
  const name = `/assets/memo.${createHash("sha256").update(text).digest("hex").slice(0, 10)}.js`;
  await writeFile(join(out, name), text);
  return name;
}

async function write(out, path, text) {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

export async function build(out = join(ROOT, "dist"), { draft = false } = {}) {
  const data = await loadBook(undefined, { draft });
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "assets"), { recursive: true });
  const assets = { css: await asset(out, "style.css", "css"), js: await asset(out, "app.js", "js"), memo: await bundleMemo(out) };
  await write(out, "index.html", indexPage(data, assets));
  for (const ch of data.chapters) await write(out, `${ch.slug}/index.html`, chapterPage(ch, data, assets));
  await write(out, "terms/index.html", termsPage(data, assets));
  await write(out, "notes/index.html", notesPage(data, assets));
  const photos = [...data.figures].filter(([, f]) => !f.svg).map(([name]) => name);
  if (photos.length) await mkdir(join(out, "figures"), { recursive: true });
  for (const name of photos) await copyFile(join(FIGURES, name), join(out, "figures", name));
  await write(out, "robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  const urls = ["/", ...data.chapters.map(pathOf), "/terms/"].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n");
  await write(out, "sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  return { out, ...data };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const draft = process.argv.includes("--draft");
  const { out, chapters, terms, missing } = await build(undefined, { draft });
  const minutes = chapters.reduce((n, c) => n + c.minutes, 0);
  console.log(`${chapters.length}장, 용어 ${terms.size}개, 읽는 데 약 ${minutes}분 → ${out}`);
  if (missing.size) console.warn(`미리보기: 아직 정리하지 않은 용어 ${missing.size}개 (${[...missing].join(", ")})`);
}
