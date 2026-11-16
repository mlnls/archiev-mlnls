// content/projects.mjs → site/projects/<slug>/index.html (목차) + site/projects/<slug>/<note>/index.html (노트)
//
//   node scripts/build-projects.mjs          파일을 씁니다
//   import { render } from ...               { "projects/<slug>/index.html": html, ... } 만 돌려줍니다 (테스트용)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
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
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
      const ext = /^https?:/.test(href);
      return `<a href="${href}"${ext ? ' rel="noopener"' : ""}>${t}</a>`;
    });
}

/** webp 헤더에서 가로 · 세로를 읽습니다 (VP8 · VP8L · VP8X). */
export function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === "VP8L") {
    const n = b.readUInt32LE(21);
    return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
  }
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`webp 형식을 읽지 못했습니다: ${file}`);
}

function img(slug, f, extra = "") {
  const [w, h] = webpSize(join(root, "projects", slug, f.src));
  return `<img src="/projects/${slug}/${f.src}" alt="${esc(f.alt)}" width="${w}" height="${h}"${extra}>`;
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

const two = (i) => String(i + 1).padStart(2, "0");

function projectPage(p, i) {
  const url = `${SITE}/projects/${p.slug}/`;
  const prev = projects[i - 1];
  const next = projects[i + 1];
  const links = p.links.map((l) => `<a class="btn" href="${l.href}" rel="noopener">${esc(l.label)} <span aria-hidden="true">↗</span></a>`).join("");
  const toc = p.notes
    .map(
      (n, k) => `<li><a class="toc-item" href="/projects/${p.slug}/${n.id}/"><span class="n">${two(k)}</span><span class="toc-body"><b>${esc(n.title)}</b><span>${esc(n.summary)}</span></span>${
        n.metric ? `<span class="toc-metric"><b>${esc(n.metric[0])}</b><small>${esc(n.metric[1])}</small></span>` : ""
      }<span class="toc-go" aria-hidden="true">→</span></a></li>`,
    )
    .join("\n        ");
  return `${head({
    title: `${p.title} | 오승민`,
    description: p.lead,
    url,
    jsonld: { "@context": "https://schema.org", "@type": "CreativeWork", "@id": `${url}#work`, url, name: p.title, inLanguage: "ko", author: { "@id": `${SITE}/#person` }, hasPart: p.notes.map((n) => ({ "@id": `${url}${n.id}/#note` })) },
  })}
<body class="pj-body">
  <main class="pj">
    <nav class="crumb" aria-label="이동"><a href="/">← 오승민 이력</a></nav>
    <header class="pj-hero">
      <div class="pj-title">
        <p class="eyebrow">${esc(p.period)}</p>
        <h1>${esc(p.title)}</h1>
        <p class="lead">${esc(p.lead)}</p>
        <p class="links">${links}</p>
      </div>
      <dl class="pj-meta"><div><dt>역할</dt><dd>${esc(p.role)}</dd></div><div><dt>기술</dt><dd><ul class="chips">${p.stack.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></dd></div></dl>
    </header>
    <figure class="pj-cover">${img(p.slug, p.cover, ' fetchpriority="high" decoding="async"')}</figure>
    <section class="pj-sec" aria-labelledby="notes">
      <h2 id="notes"><span class="idx">${p.notes.length}</span>문제 노트</h2>
      <p class="note">문제 하나씩 정리했습니다. 누르면 그 문제만 볼 수 있습니다.</p>
      <ol class="toc">
        ${toc}
      </ol>
    </section>
    <nav class="pj-nav" aria-label="다른 프로젝트">${prev ? `<a class="prev" href="/projects/${prev.slug}/"><small>← 이전 프로젝트</small><b>${esc(prev.title)}</b></a>` : ""}${
      next ? `<a class="next" href="/projects/${next.slug}/"><small>다음 프로젝트 →</small><b>${esc(next.title)}</b></a>` : ""
    }</nav>
  </main>
</body>
</html>
`;
}

const BLOCKS = [
  ["problem", "문제"],
  ["solution", "해결"],
  ["result", "결과"],
];

function notePage(p, n, k) {
  const url = `${SITE}/projects/${p.slug}/${n.id}/`;
  const prev = p.notes[k - 1];
  const next = p.notes[k + 1];
  const figs = (at) =>
    (n.figures ?? [])
      .filter((f) => f.at === at)
      .map((f) => `<figure class="nt-fig"><a href="/projects/${p.slug}/${f.src}" target="_blank" rel="noopener">${img(p.slug, f, ' loading="lazy" decoding="async"')}</a><figcaption>${inline(f.caption)}</figcaption></figure>`)
      .join("");
  const blocks = BLOCKS.map(
    ([key, label]) => `<section class="nt-blk ${key}"><h2><span class="nt-tag">${label}</span></h2><ul>${n[key].map((t) => `<li>${inline(t)}</li>`).join("")}</ul>${figs(key)}</section>`,
  ).join("\n      ");
  const memo = n.memo?.length ? `\n      <aside class="nt-memo"><h2>메모</h2><ul>${n.memo.map((t) => `<li>${inline(t)}</li>`).join("")}</ul></aside>` : "";
  const chips = p.notes
    .map((m, j) => `<li><a href="/projects/${p.slug}/${m.id}/"${m.id === n.id ? ' aria-current="page"' : ""}><span>${two(j)}</span><span class="t">${esc(m.title)}</span></a></li>`)
    .join("");
  return `${head({
    title: `${n.title} · ${p.title} | 오승민`,
    description: n.summary,
    url,
    jsonld: { "@context": "https://schema.org", "@type": "Article", "@id": `${url}#note`, url, headline: n.title, description: n.summary, inLanguage: "ko", author: { "@id": `${SITE}/#person` }, isPartOf: { "@id": `${SITE}/projects/${p.slug}/#work` } },
  })}
<body class="pj-body">
  <main class="pj nt">
    <nav class="crumb" aria-label="이동"><a href="/projects/${p.slug}/">← ${esc(p.title)}</a></nav>
    <header class="nt-head">
      <p class="eyebrow">${esc(p.title)} · 노트 ${two(k)} / ${two(p.notes.length - 1)}</p>
      <h1>${esc(n.title)}</h1>
      <p class="lead">${esc(n.summary)}</p>${n.metric ? `\n      <p class="nt-metric"><b>${esc(n.metric[0])}</b><span>${esc(n.metric[1])}</span></p>` : ""}
    </header>
    <nav class="nt-toc" aria-label="이 프로젝트의 노트"><ol>${chips}</ol></nav>
    <article class="nt-body">
      ${blocks}${memo}
    </article>
    <nav class="pj-nav" aria-label="다른 노트">${
      prev ? `<a class="prev" href="/projects/${p.slug}/${prev.id}/"><small>← 이전 노트</small><b>${esc(prev.title)}</b></a>` : `<a class="prev" href="/projects/${p.slug}/"><small>← 목차</small><b>${esc(p.title)}</b></a>`
    }${next ? `<a class="next" href="/projects/${p.slug}/${next.id}/"><small>다음 노트 →</small><b>${esc(next.title)}</b></a>` : `<a class="next" href="/projects/${p.slug}/"><small>목차로 →</small><b>${esc(p.title)}</b></a>`}</nav>
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
  // 지운 노트의 폴더가 남지 않게, 각 프로젝트 아래 하위 폴더를 먼저 비웁니다 (이미지는 그대로)
  for (const p of projects) {
    const dir = join(root, "projects", p.slug);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) if (statSync(join(dir, name)).isDirectory()) rmSync(join(dir, name), { recursive: true });
  }
  for (const [rel, html] of Object.entries(render())) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), html);
  }
  console.log(`${Object.keys(render()).length}개 파일을 만들었습니다.`);
}
