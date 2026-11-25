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
export const SITE = "https://cs.mlnl.site";
const BLOG = "https://blog.mlnl.site";
const CV = "https://mlnl.site/";
const GITHUB = "https://github.com/mlnls";

const num = (i) => String(i + 1).padStart(2, "0");
const pathOf = (ch) => `/${ch.slug}/`;
/** 실습 수 + 다 읽음 하나 */
const countOf = (ch) => ch.practice.length + 1;
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
  <script src="${assets.js}" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="site-header-in">
      <a class="wordmark" href="/">mlnl<span>cs</span></a>
      <nav aria-label="주요 메뉴">
        <a href="/terms/">용어 사전</a>
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
              <div class="meta"><span>${c.minutes}분</span><span>용어 ${c.terms.length}</span><span>실습 ${c.practice.length}</span>${c.quiz.length ? `<span>문제 ${c.quiz.length}</span>` : ""}</div>
            </div>
            ${progress(c.slug, countOf(c), `${c.title} 진행`)}
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
      <p class="side-title">전체 진행</p>
      ${progress("*", total, "전체 진행")}
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
  const nav = `<nav class="stage-nav" aria-label="다른 장">
          ${prev ? `<a href="${pathOf(prev)}"><span>이전 장</span>${num(prev.index)} ${esc(prev.title)}</a>` : `<a href="/"><span>처음</span>차례로 돌아가기</a>`}
          ${next ? `<a class="next" href="${pathOf(next)}"><span>다음 장</span>${num(next.index)} ${esc(next.title)}</a>` : `<a class="next" href="/"><span>끝</span>차례로 돌아가기</a>`}
        </nav>`;
  const body = `  <main class="page">
    <article>
      <header class="stage-head">
        <p class="stage-meta"><a href="/">차례</a><span>${ch.part + 1}부 ${esc(parts[ch.part].title)}</span><span>${num(ch.index)}장</span><span>읽는 데 ${ch.minutes}분</span></p>
        <h1>${esc(ch.title)}</h1>
        <p class="stage-goal">${inline(ch.summary, { slug: ch.slug, terms })}</p>
        ${progress(ch.slug, countOf(ch), "이 장 진행")}
      </header>
      <div class="stage-layout">
        <div class="stage-main">
          <div class="prose">
${ch.html}
          </div>
          <label class="finish"><input type="checkbox" data-key="${esc(`${ch.slug}:read`)}"><span>이 장을 다 읽었어요</span></label>
          ${nav}
        </div>
        <nav class="toc" aria-label="목차">
          <p class="toc-title">이 장의 차례</p>
          <ul>
${ch.toc.map((t) => `            <li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("\n")}
          </ul>
        </nav>
      </div>
    </article>
  </main>`;
  return page({ title: `${num(ch.index)} ${ch.title} | ${book.title}`, description: plain(ch.summary), path: pathOf(ch), body, assets });
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

async function write(out, path, text) {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

export async function build(out = join(ROOT, "dist"), { draft = false } = {}) {
  const data = await loadBook(undefined, { draft });
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "assets"), { recursive: true });
  const assets = { css: await asset(out, "style.css", "css"), js: await asset(out, "app.js", "js") };
  await write(out, "index.html", indexPage(data, assets));
  for (const ch of data.chapters) await write(out, `${ch.slug}/index.html`, chapterPage(ch, data, assets));
  await write(out, "terms/index.html", termsPage(data, assets));
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
