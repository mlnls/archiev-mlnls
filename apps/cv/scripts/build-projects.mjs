// content/projects.mjs + content/notes/<slug>.md
//   → site/projects/<slug>/index.html (목차) + site/projects/<slug>/<note>/index.html (글)
//
//   node scripts/build-projects.mjs          파일을 씁니다
//   import { render } from ...               { "projects/<slug>/index.html": html, ... } 만 돌려줍니다 (테스트용)
import { writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import hljs from "highlight.js/lib/core";
import apache from "highlight.js/lib/languages/apache";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import markdownLang from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";

import { projects } from "../content/projects.mjs";

for (const [name, lang] of Object.entries({ apache, bash, javascript, markdown: markdownLang, typescript, yaml })) hljs.registerLanguage(name, lang);

/** 코드 블록 언어: ```<키> <파일 이름> → [화면에 보일 이름, highlight.js 언어 (없으면 색 없이)] */
const LANGS = {
  ts: ["TypeScript", "typescript"],
  tsx: ["TSX", "typescript"],
  js: ["JavaScript", "javascript"],
  yaml: ["YAML", "yaml"],
  bash: ["Bash", "bash"],
  markdown: ["Markdown", "markdown"],
  apache: ["Apache", "apache"],
  caddyfile: ["Caddyfile", null],
  text: ["Text", null],
};

function codeBlock(info, code) {
  const [key = "", ...rest] = info.trim().split(/\s+/);
  const lang = LANGS[key];
  if (!lang) throw new Error(`코드 블록 언어를 적어 주세요: \`\`\`${info} (${Object.keys(LANGS).join(", ")})`);
  const [label, hl] = lang;
  const body = hl ? hljs.highlight(code, { language: hl }).value : esc(code);
  const file = rest.join(" ");
  return `<div class="code"><div class="code-head">${file ? `<span class="file">${esc(file)}</span>` : "<span></span>"}<span class="lang">${label}</span></div><pre><code>${body}</code></pre></div>`;
}

const SITE = "https://mlnl.site";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "site");
const notesDir = join(here, "..", "content", "notes");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `코드`, **강조**, [글자](주소) 만 지원하는 한 줄 마크업 */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener"' : ""}>${t}</a>`);
}

/** content/notes/<slug>.md 를 `@@ <note id>` 줄로 나눕니다 */
export function readNotes(slug) {
  const file = join(notesDir, `${slug}.md`);
  if (!existsSync(file)) return {};
  const out = {};
  let id = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^@@ ([\w-]+)\s*$/.exec(line);
    if (m) out[(id = m[1])] = [];
    else if (id) out[id].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()]));
}

/** WebP 헤더에서 가로 · 세로를 읽습니다 (VP8 · VP8L · VP8X) */
function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === "VP8L") {
    const n = b.readUInt32LE(21);
    return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

/**
 * 글 본문용 작은 마크다운: ## · ###, 문단(줄바꿈 유지), - · 1. 목록, > 인용, ```언어 파일이름 코드, | 표,
 * 그리고 한 줄에 홀로 있는 ![설명](파일.webp "캡션") 그림.
 * toc 배열을 넘기면 ## · ### 제목을 { level, id, text }로 채웁니다. 제목에는 같은 id가 붙습니다.
 */
export function markdown(src, slug, toc = []) {
  const lines = src.split("\n");
  const html = [];
  const ids = new Set();
  let i = 0;
  const take = (re) => {
    const got = [];
    while (i < lines.length && re.test(lines[i])) got.push(lines[i++]);
    return got;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("```")) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      html.push(codeBlock(line.slice(3), body.join("\n")));
      continue;
    }
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2]).replace(/<[^>]+>/g, "");
      let id = text.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "") || `s-${ids.size + 1}`;
      for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`;
      ids.add(id);
      toc.push({ level, id, text });
      html.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    const img = /^!\[([^\]]+)\]\(([\w.-]+)(?: "([^"]+)")?\)$/.exec(line);
    if (img) {
      const [, alt, name, caption] = img;
      const [w, h2] = webpSize(join(root, "projects", slug, name));
      const cls = w < 1000 ? ' class="narrow"' : "";
      html.push(
        `<figure${cls}><img src="/projects/${slug}/${name}" width="${w}" height="${h2}" alt="${esc(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${inline(caption)}</figcaption>` : ""}</figure>`,
      );
      i++;
      continue;
    }
    if (/^- /.test(line)) {
      html.push(`<ul>${take(/^- /).map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      html.push(`<ol>${take(/^\d+\. /).map((l) => `<li>${inline(l.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith("> ")) {
      html.push(`<blockquote><p>${take(/^> /).map((l) => inline(l.slice(2))).join("<br>")}</p></blockquote>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows = take(/^\|/).map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, , ...body] = rows;
      html.push(
        `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    // 문단: 빈 줄이나 다른 블록이 나올 때까지, 줄바꿈은 그대로 살립니다
    const para = take(/^(?!\s*$|```|#{2,3} |!\[|- |\d+\. |> |\|)/);
    html.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return html.join("\n      ");
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
          <div><a class="ti" href="/projects/${p.slug}/${n.id}/">${esc(n.title)}</a>${n.metric ? ` <span class="mt">${esc(n.metric[0])} · ${esc(n.metric[1])}</span>` : ""}</div>
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

function notePage(p, n, k, body) {
  const url = `${SITE}/projects/${p.slug}/${n.id}/`;
  const prev = p.notes[k - 1];
  const next = p.notes[k + 1];
  const toc = [];
  const article = markdown(body, p.slug, toc);
  const tocNav = toc.length < 2 ? "" : `
    <aside class="toc" aria-label="이 글의 목차">
      <nav>
        <p>목차</p>
        <ol>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${t.text}</a></li>`).join("")}</ol>
      </nav>
    </aside>`;
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
      <p class="meta">${esc(p.title)} · ${k + 1}/${p.notes.length}</p>
    </header>${tocNav}
    <article class="post">
      ${article}
    </article>
    <nav class="others" aria-label="이 프로젝트의 다른 글">
      <h2>${esc(p.title)}</h2>
      <ol>${others}</ol>
    </nav>
    <nav class="pager" aria-label="이전 · 다음 글">${prev ? `<a href="/projects/${p.slug}/${prev.id}/">← ${esc(prev.title)}</a>` : `<a href="/projects/${p.slug}/">← 목차</a>`}${
      next ? `<a href="/projects/${p.slug}/${next.id}/">${esc(next.title)} →</a>` : `<a href="/projects/${p.slug}/">목차 →</a>`
    }</nav>
  </main>${tocNav ? `
  <script>${TOC_SCRIPT}</script>` : ""}
</body>
</html>
`;
}

// 목차에서 지금 읽는 제목을 표시합니다. 화면 위쪽 120px을 지난 마지막 제목이 "지금 읽는 곳"입니다.
const TOC_SCRIPT = `(() => {
    const links = [...document.querySelectorAll(".toc a")];
    const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    let ticking = false;
    const update = () => {
      ticking = false;
      let at = 0;
      heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top < 120) at = i; });
      links.forEach((a, i) => a.toggleAttribute("aria-current", i === at));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  })();`;

export function render() {
  const out = {};
  projects.forEach((p, i) => {
    const bodies = readNotes(p.slug);
    out[`projects/${p.slug}/index.html`] = projectPage(p, i);
    p.notes.forEach((n, k) => {
      if (!bodies[n.id]) throw new Error(`content/notes/${p.slug}.md 에 "@@ ${n.id}" 글이 없습니다`);
      out[`projects/${p.slug}/${n.id}/index.html`] = notePage(p, n, k, bodies[n.id]);
    });
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
  // 지운 글의 폴더가 남지 않게, 각 프로젝트 아래 하위 폴더를 먼저 비웁니다 (그림 파일은 그대로 둡니다)
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
