// content/projects.mjs → site/projects/<slug>/index.html (목차) + site/projects/<slug>/<note>/index.html (노트)
//
//   node scripts/build-projects.mjs          파일을 씁니다
//   import { render } from ...               { "projects/<slug>/index.html": html, ... } 만 돌려줍니다 (테스트용)
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { projects } from "../content/projects.mjs";

const SITE = "https://mlnl.site";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `코드`, **강조**, [글자](주소) 만 지원하는 한 줄 마크업 */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener"' : ""}>${t}</a>`);
}

function head({ title, description, url, jsonld }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:locale" content="ko_KR">
  <meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161513" media="(prefers-color-scheme: dark)">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">
  ${JSON.stringify(jsonld, null, 2).replace(/\n/g, "\n  ")}
  </script>
</head>`;
}

const ext = (l) => `<a href="${l.href}" rel="noopener">${esc(l.label)}</a>`;

function projectPage(p, i) {
  const url = `${SITE}/projects/${p.slug}/`;
  const prev = projects[i - 1];
  const next = projects[i + 1];
  const items = p.notes
    .map(
      (n, k) => `<li>
          <span class="no">${k + 1}.</span>
          <div>
            <a class="ti" href="/projects/${p.slug}/${n.id}/">${esc(n.title)}</a>${n.metric ? ` <span class="mt">${esc(n.metric[0])} · ${esc(n.metric[1])}</span>` : ""}
            <p>${esc(n.summary)}</p>
          </div>
        </li>`,
    )
    .join("\n        ");
  return `${head({
    title: `${p.title} | 오승민`,
    description: p.lead,
    url,
    jsonld: { "@context": "https://schema.org", "@type": "CreativeWork", "@id": `${url}#work`, url, name: p.title, inLanguage: "ko", author: { "@id": `${SITE}/#person` }, hasPart: p.notes.map((n) => ({ "@id": `${url}${n.id}/#note` })) },
  })}
<body>
  <main class="doc">
    <nav class="back" aria-label="이동"><a href="/">← 오승민 이력</a></nav>
    <header>
      <h1>${esc(p.title)}</h1>
      <p class="meta">${esc(p.period)} · ${p.links.map(ext).join(" · ")}</p>
      <p class="lead">${esc(p.lead)}</p>
      <p class="meta">역할: ${esc(p.role)}<br>기술: ${p.stack.map(esc).join(", ")}</p>
    </header>
    <ol class="list">
        ${items}
    </ol>
    <nav class="pager" aria-label="다른 프로젝트">${prev ? `<a href="/projects/${prev.slug}/">← ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a href="/projects/${next.slug}/">${esc(next.title)} →</a>` : ""}</nav>
  </main>
</body>
</html>
`;
}

const BLOCKS = [
  ["problem", "문제"],
  ["solution", "해결"],
  ["result", "결과"],
  ["memo", "메모"],
];

function notePage(p, n, k) {
  const url = `${SITE}/projects/${p.slug}/${n.id}/`;
  const prev = p.notes[k - 1];
  const next = p.notes[k + 1];
  const blocks = BLOCKS.filter(([key]) => n[key]?.length)
    .map(([key, label]) => `<h2>${label}</h2>\n      <ul>${n[key].map((t) => `\n        <li>${inline(t)}</li>`).join("")}\n      </ul>`)
    .join("\n      ");
  const others = p.notes
    .map((m, j) => (m.id === n.id ? `<li><b>${j + 1}. ${esc(m.title)}</b></li>` : `<li><a href="/projects/${p.slug}/${m.id}/">${j + 1}. ${esc(m.title)}</a></li>`))
    .join("");
  return `${head({
    title: `${n.title} · ${p.title} | 오승민`,
    description: n.summary,
    url,
    jsonld: { "@context": "https://schema.org", "@type": "Article", "@id": `${url}#note`, url, headline: n.title, description: n.summary, inLanguage: "ko", author: { "@id": `${SITE}/#person` }, isPartOf: { "@id": `${SITE}/projects/${p.slug}/#work` } },
  })}
<body>
  <main class="doc">
    <nav class="back" aria-label="이동"><a href="/projects/${p.slug}/">← ${esc(p.title)}</a></nav>
    <header>
      <h1>${esc(n.title)}</h1>
      <p class="meta">${esc(p.title)} · ${k + 1}/${p.notes.length}${n.metric ? ` · ${esc(n.metric[0])} (${esc(n.metric[1])})` : ""}</p>
      <p class="lead">${esc(n.summary)}</p>
    </header>
    <article class="body">
      ${blocks}
    </article>
    <nav class="others" aria-label="이 프로젝트의 다른 노트">
      <h2>${esc(p.title)}</h2>
      <ol>${others}</ol>
    </nav>
    <nav class="pager" aria-label="이전 · 다음 노트">${prev ? `<a href="/projects/${p.slug}/${prev.id}/">← ${esc(prev.title)}</a>` : `<a href="/projects/${p.slug}/">← 목차</a>`}${
      next ? `<a href="/projects/${p.slug}/${next.id}/">${esc(next.title)} →</a>` : `<a href="/projects/${p.slug}/">목차 →</a>`
    }</nav>
  </main>
</body>
</html>
`;
}

export function render() {
  const out = {};
  projects.forEach((p, i) => {
    out[`projects/${p.slug}/index.html`] = projectPage(p, i);
    p.notes.forEach((n, k) => (out[`projects/${p.slug}/${n.id}/index.html`] = notePage(p, n, k)));
  });
  const urls = [`${SITE}/`, ...projects.flatMap((p) => [`${SITE}/projects/${p.slug}/`, ...p.notes.map((n) => `${SITE}/projects/${p.slug}/${n.id}/`)])];
  out["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 지운 노트의 폴더가 남지 않게, 각 프로젝트 아래 하위 폴더를 먼저 비웁니다
  for (const p of projects) {
    const dir = join(root, "projects", p.slug);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) if (statSync(join(dir, name)).isDirectory()) rmSync(join(dir, name), { recursive: true });
  }
  const out = render();
  for (const [rel, html] of Object.entries(out)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), html);
  }
  console.log(`${Object.keys(out).length}개 파일을 만들었습니다.`);
}
