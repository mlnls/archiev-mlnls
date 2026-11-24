// content/roadmap.mjs로 정적 사이트를 만듭니다. 의존성 없이 Node 기본 기능만 씁니다.
//   node scripts/build.mjs            → dist/
// 주소는 mlnl.site 기준으로 적고, 이미지를 만들 때 Dockerfile이 실제 도메인으로 바꿉니다.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { intro, stages, tracks } from "../content/roadmap.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SITE = "https://cs.mlnl.site";
const BLOG = "https://blog.mlnl.site";
const CV = "https://mlnl.site/";
const GITHUB = "https://github.com/mlnls";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 글 안의 `코드`를 <code>로 바꿉니다. 나머지는 모두 이스케이프합니다 */
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const num = (i) => String(i + 1).padStart(2, "0");
const pathOf = (stage) => `/${stage.slug}/`;
/** 진행 기록의 열쇠: 단계:종류:id */
const keyOf = (stage, kind, id) => `${stage.slug}:${kind}:${id}`;
const countOf = (stage) => stage.concepts.length + stage.practice.length;

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

function resourceList(resources) {
  return `<ul class="res">
${resources
  .map((r) => {
    const name = r.url ? `<a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a>` : `<span>${esc(r.title)}</span>`;
    const tags = [r.main ? "메인" : null, r.kind, r.lang, r.free ? "무료" : "유료"].filter(Boolean);
    return `  <li${r.main ? ' class="is-main"' : ""}>
    <p class="res-title">${name}${r.by ? `<span class="res-by">${esc(r.by)}</span>` : ""}</p>
    <p class="res-tags">${tags.map((t) => `<span${t === "메인" ? ' class="is-main"' : ""}>${esc(t)}</span>`).join("")}</p>
    ${r.note ? `<p class="res-note">${inline(r.note)}</p>` : ""}
  </li>`;
  })
  .join("\n")}
</ul>`;
}

function checklist(stage, kind, items) {
  return `<ol class="checklist">
${items
  .map(
    (it) => `  <li>
    <label>
      <input type="checkbox" data-key="${esc(keyOf(stage, kind, it.id))}">
      <span><strong>${inline(it.title)}</strong><span>${inline(it.desc)}</span></span>
    </label>
  </li>`,
  )
  .join("\n")}
</ol>`;
}

function indexPage(assets) {
  const total = stages.reduce((n, s) => n + countOf(s), 0);
  const weeks = stages.reduce((n, s) => n + s.weeks, 0);
  const rows = stages
    .map(
      (s, i) => `    <li>
      <a class="row" href="${pathOf(s)}">
        <span class="row-num">${num(i)}</span>
        <div class="row-text">
          <h2>${esc(s.title)}</h2>
          <p>${inline(s.goal)}</p>
          <div class="meta"><span>${s.weeks}주</span><span>개념 ${s.concepts.length}</span><span>실습 ${s.practice.length}</span></div>
        </div>
        ${progress(s.slug, countOf(s), `${s.title} 진행`)}
      </a>
    </li>`,
    )
    .join("\n");
  const trackRows = tracks
    .map(
      (t) => `    <li class="track">
      <h3>${esc(t.title)}</h3>
      <p>${inline(t.desc)}</p>
      ${resourceList(t.resources)}
    </li>`,
    )
    .join("\n");
  const body = `  <main class="list-page">
    <h1 class="sr-only">${esc(intro.title)}</h1>
    <ol class="rows">
${rows}
    </ol>
    <aside class="side" aria-label="로드맵 안내">
      <p class="side-title">${esc(intro.title)}</p>
      <p class="side-text">${inline(intro.summary)}</p>
      <p class="side-meta">${stages.length}단계 · 약 ${weeks}주</p>
      <p class="side-title">전체 진행</p>
      ${progress("*", total, "전체 진행")}
      <p class="side-title">이렇게 공부해요</p>
      <ul class="tips">
${intro.tips.map((t) => `        <li>${inline(t)}</li>`).join("\n")}
      </ul>
      <button type="button" class="reset" data-reset>진행 기록 지우기</button>
    </aside>
    <section class="tracks" aria-labelledby="tracks-title">
      <p class="side-title" id="tracks-title">곁가지</p>
      <ul>
${trackRows}
      </ul>
    </section>
  </main>`;
  return page({ title: `${intro.title} | mlnl`, description: intro.description, path: "/", body, assets });
}

const SECTIONS = [
  ["outcomes", "이 단계를 마치면"],
  ["frontend", "프론트엔드와 이어지는 곳"],
  ["concepts", "개념"],
  ["practice", "직접 해보기"],
  ["questions", "스스로 점검"],
  ["resources", "자료"],
];

function stagePage(stage, i, assets) {
  const prev = stages[i - 1];
  const next = stages[i + 1];
  const nav = `<nav class="stage-nav" aria-label="다른 단계">
          ${prev ? `<a href="${pathOf(prev)}"><span>이전 단계</span>${num(i - 1)} ${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a class="next" href="${pathOf(next)}"><span>다음 단계</span>${num(i + 1)} ${esc(next.title)}</a>` : `<a class="next" href="/"><span>끝</span>로드맵으로 돌아가기</a>`}
        </nav>`;
  const body = `  <main class="page">
    <article>
      <header class="stage-head">
        <p class="stage-meta"><a href="/">로드맵</a><span>${num(i)}단계</span><span>${stage.weeks}주</span></p>
        <h1>${esc(stage.title)}</h1>
        <p class="stage-goal">${inline(stage.goal)}</p>
        ${progress(stage.slug, countOf(stage), "이 단계 진행")}
      </header>
      <div class="stage-layout">
        <div class="stage-main">
          <section id="outcomes" aria-labelledby="h-outcomes">
            <h2 id="h-outcomes">이 단계를 마치면</h2>
            <ul class="bullets">
${stage.outcomes.map((o) => `              <li>${inline(o)}</li>`).join("\n")}
            </ul>
          </section>
          <section id="frontend" aria-labelledby="h-frontend">
            <h2 id="h-frontend">프론트엔드와 이어지는 곳</h2>
            <ul class="bullets">
${stage.frontend.map((o) => `              <li>${inline(o)}</li>`).join("\n")}
            </ul>
          </section>
          <section id="concepts" aria-labelledby="h-concepts">
            <h2 id="h-concepts">개념</h2>
            <p class="hint">남에게 설명할 수 있으면 체크합니다. 체크는 이 브라우저에 저장됩니다.</p>
            ${checklist(stage, "c", stage.concepts)}
          </section>
          <section id="practice" aria-labelledby="h-practice">
            <h2 id="h-practice">직접 해보기</h2>
            ${checklist(stage, "p", stage.practice)}
          </section>
          <section id="questions" aria-labelledby="h-questions">
            <h2 id="h-questions">스스로 점검</h2>
            <p class="hint">답을 먼저 써 보고 펼쳐서 맞춰 봅니다.</p>
            <div class="qa">
${stage.questions.map((q) => `              <details>\n                <summary>${inline(q.q)}</summary>\n                <p>${inline(q.a)}</p>\n              </details>`).join("\n")}
            </div>
          </section>
          <section id="resources" aria-labelledby="h-resources">
            <h2 id="h-resources">자료</h2>
            ${resourceList(stage.resources)}
          </section>
          ${nav}
        </div>
        <nav class="toc" aria-label="목차">
          <p class="toc-title">목차</p>
          <ul>
${SECTIONS.map(([id, label]) => `            <li><a href="#${id}">${label}</a></li>`).join("\n")}
          </ul>
        </nav>
      </div>
    </article>
  </main>`;
  return page({ title: `${num(i)} ${stage.title} | ${intro.title}`, description: stage.goal.replace(/`/g, ""), path: pathOf(stage), body, assets });
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

export async function build(out = join(ROOT, "dist")) {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "assets"), { recursive: true });
  const assets = { css: await asset(out, "style.css", "css"), js: await asset(out, "app.js", "js") };
  await write(out, "index.html", indexPage(assets));
  for (const [i, stage] of stages.entries()) await write(out, `${stage.slug}/index.html`, stagePage(stage, i, assets));
  await write(out, "robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  const urls = ["/", ...stages.map(pathOf)].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n");
  await write(out, "sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await build();
  console.log(`${stages.length}단계를 ${out}에 만들었습니다`);
}
