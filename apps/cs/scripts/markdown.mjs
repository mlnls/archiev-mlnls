// 책 본문을 HTML로 바꾸는 작은 마크다운 변환기. 의존성 없이 이 사이트가 쓰는 문법만 다룹니다.
//
// 블록: ## 제목 {#id}, ### 제목, 문단, - 목록, 1. 목록(들여쓰기로 중첩), ```언어 이름표, | 표 |, > 참고 상자
//       ![설명](파일)   → content/figures/의 그림. SVG는 본문에 바로 넣어 색 토큰을 따르고, 사진은 <img>로 겁니다
// 상자:  :::terms        - 용어 (영문) — 설명         → 용어 정리 (용어 사전에도 모입니다)
//        :::practice id 제목  …본문…               → 체크할 수 있는 실습
//        :::qa 질문           …답…                 → 펼쳐 보는 점검 질문
//        :::quiz id 질문      - [ ] 보기 / - [x] 정답  → 눌러서 푸는 문제 (보기 둘 이상, 정답은 하나)
//                             = 답 | 다른 표기         → 또는 답을 쳐 넣는 문제
//                             (빈 줄 뒤) …해설…
//        모든 상자는 줄 하나에 ::: 만 써서 닫습니다.
// 글자: `코드`, **굵게**, [글자](주소), [[용어]] 또는 [[보일 글자|용어]] → 용어 사전 링크

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "UEFI (Unified …)" → "UEFI". 용어를 가리킬 때 쓰는 이름입니다 */
export const termKey = (name) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();
export const termId = (key) => `t-${slug(key)}`;
export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** 꾸밈 문법을 걷어낸 글자. title 속성과 읽는 시간 계산에 씁니다 */
export const plain = (s) =>
  s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");

export function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("맨 위에 --- 로 감싼 머리말이 없습니다");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(": ");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 2).trim();
  }
  return { meta, body: src.replace(/\r\n/g, "\n").slice(m[0].length) };
}

/** 목록 줄들을 항목별로 나눕니다. 들여쓴 줄과 그 사이 빈 줄은 앞 항목에 붙습니다 */
function items(lines, marker, indent) {
  const out = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (marker.test(line)) out.push([line.replace(marker, "")]);
    else if (out.length && /^ {2,}\S/.test(line)) out.at(-1).push(line.slice(Math.min(indent, line.search(/\S/))));
    else if (out.length && !line.trim() && /^ {2,}\S/.test(lines[i + 1] ?? "")) out.at(-1).push("");
    else break;
  }
  return { list: out, next: i };
}

/** :::terms 본문 → [{ name, key, def }] */
function parseTerms(lines) {
  return items(lines, /^- /, 2).list.map((lines) => {
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    const at = text.indexOf(" — ");
    if (at < 0) throw new Error(`용어 줄에 " — "가 없습니다: ${text}`);
    const name = text.slice(0, at).trim();
    return { name, key: termKey(name), def: text.slice(at + 3).trim() };
  });
}

/** 한 장의 본문에서 용어 정리를 모두 꺼냅니다 */
export function extractTerms(body) {
  const terms = [];
  for (const m of body.matchAll(/^:::terms[^\n]*\n([\s\S]*?)\n:::$/gm)) terms.push(...parseTerms(m[1].split("\n")));
  return terms;
}

export function inline(text, ctx) {
  // 코드 안은 건드리지 않도록 먼저 빼 둡니다
  const codes = [];
  const masked = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  const restore = (s) => s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[Number(n)])}</code>`);
  const rich = (s) => {
    let out = "";
    let last = 0;
    for (const m of s.matchAll(/\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g)) {
      out += esc(s.slice(last, m.index));
      if (m[1]) {
        const [label, key] = m[1].includes("|") ? m[1].split("|") : [m[1], m[1]];
        const term = ctx.terms.get(key.trim());
        if (!term && ctx.draft) {
          ctx.missing?.add(key.trim());
          out += rich(label);
          last = m.index + m[0].length;
          continue;
        }
        if (!term) throw new Error(`[[${key}]]: 용어 정리에 없는 용어입니다 (${ctx.slug ?? "?"})`);
        ctx.refs?.add(key.trim());
        out += `<a class="term" href="/terms/#${term.id}" title="${esc(plain(term.def))}">${rich(label)}</a>`;
      } else if (m[2]) {
        const external = /^https?:/.test(m[3]);
        if (external && !m[3].startsWith("https://")) throw new Error(`https가 아닌 링크입니다: ${m[3]}`);
        out += `<a href="${esc(m[3])}"${external ? ' rel="noopener"' : ""}>${rich(m[2])}</a>`;
      } else out += `<strong>${rich(m[4])}</strong>`;
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  };
  return restore(rich(masked));
}

const BLOCK = /^(#{2,3} |```|:::|\||> ?|- |\d+\. |!\[)/;
const FIGURE = /^!\[([^\]]*)\]\(([\w.-]+)\)\s*$/;

/**
 * 그림 하나를 <figure>로. SVG 안의 id는 파일 이름을 앞에 붙여, 한 쪽에 그림이 여럿이어도 겹치지 않게 합니다.
 * ctx.figures: Map<파일 이름, { svg?: string }>
 */
function figure(caption, file, ctx) {
  const fig = ctx.figures?.get(file);
  if (!fig) throw new Error(`그림 파일이 없습니다: content/figures/${file} (${ctx.slug})`);
  if (!caption) throw new Error(`그림에 설명이 없습니다: ${file} (${ctx.slug})`);
  const alt = esc(plain(caption));
  let body;
  if (fig.svg) {
    const ns = file.replace(/\.svg$/, "");
    body = fig.svg
      .replace(/<\?xml[^>]*\?>\s*/, "")
      .replace(/<!--[\s\S]*?-->\s*/g, "")
      .replace(/\bid="([^"]+)"/g, `id="${ns}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${ns}-$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${ns}-$1"`)
      .replace(/<svg\b/, `<svg role="img" aria-label="${alt}"`)
      .trim();
  } else {
    body = `<img src="/figures/${esc(file)}" alt="${alt}" loading="lazy" decoding="async">`;
  }
  return `<figure class="fig">\n<div class="fig-body">\n${body}\n</div>\n<figcaption>${inline(caption, ctx)}</figcaption>\n</figure>`;
}

/**
 * 본문 → { html, toc, practice }.
 * ctx: { slug, terms: Map<용어, {id, def}>, refs?: Set } — 없는 용어를 가리키면 오류를 냅니다
 */
export function render(body, ctx) {
  const toc = [];
  const practice = [];
  const quiz = [];
  const ids = new Set();
  const uniqueId = (base) => {
    let id = base || "section";
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  function blocks(src) {
    const lines = src.split("\n");
    /** @type {{ html: string, group?: string }[]} */
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (!line.trim()) {
        i++;
      } else if ((m = /^```(\S*)\s*(.*)$/.exec(line))) {
        const buf = [];
        for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) buf.push(lines[i]);
        if (i >= lines.length) throw new Error(`코드 블록이 닫히지 않았습니다 (${ctx.slug})`);
        i++;
        const label = m[2] || (m[1] && m[1] !== "text" ? m[1] : "");
        out.push({ html: `<pre${label ? ` data-lang="${esc(label)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>` });
      } else if ((m = /^:::(\w+)\s*(.*)$/.exec(line))) {
        const buf = [];
        for (i++; i < lines.length && lines[i] !== ":::"; i++) buf.push(lines[i]);
        if (i >= lines.length) throw new Error(`:::${m[1]} 상자가 닫히지 않았습니다 (${ctx.slug})`);
        i++;
        out.push(container(m[1], m[2].trim(), buf));
      } else if ((m = FIGURE.exec(line))) {
        out.push({ html: figure(m[1], m[2], ctx) });
        i++;
      } else if ((m = /^(#{2,3}) (.+?)(?:\s+\{#([\w-]+)\})?$/.exec(line))) {
        const level = m[1].length;
        const id = uniqueId(m[3] || slug(plain(m[2])));
        if (level === 2) toc.push({ id, text: plain(m[2]) });
        out.push({ html: `<h${level} id="${id}">${inline(m[2], ctx)}</h${level}>` });
        i++;
      } else if (line.startsWith("|")) {
        const rows = [];
        for (; i < lines.length && lines[i].startsWith("|"); i++) {
          rows.push(
            lines[i]
              .trim()
              .replace(/^\||\|$/g, "")
              .split(/(?<!\\)\|/)
              .map((c) => c.trim().replace(/\\\|/g, "|")),
          );
        }
        if (rows.length < 2 || !rows[1].every((c) => /^:?-+:?$/.test(c))) throw new Error(`표의 둘째 줄은 --- 구분선이어야 합니다 (${ctx.slug})`);
        const [head, , ...body] = rows;
        out.push({
          html: `<div class="table"><table>
<thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join("")}</tr></thead>
<tbody>
${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join("")}</tr>`).join("\n")}
</tbody>
</table></div>`,
        });
      } else if (/^> ?/.test(line)) {
        const buf = [];
        for (; i < lines.length && /^>/.test(lines[i]); i++) buf.push(lines[i].replace(/^> ?/, ""));
        out.push({ html: `<aside class="note">\n${join(blocks(buf.join("\n")))}\n</aside>` });
      } else if (/^(- |\d+\. )/.test(line)) {
        const ordered = /^\d/.test(line);
        const { list, next } = items(lines.slice(i), ordered ? /^\d+\. / : /^- /, ordered ? 3 : 2);
        i += next;
        const lis = list.map((item) => `<li>${tight(join(blocks(item.join("\n"))))}</li>`);
        out.push({ html: `<${ordered ? "ol" : "ul"}>\n${lis.join("\n")}\n</${ordered ? "ol" : "ul"}>` });
      } else {
        const buf = [];
        for (; i < lines.length && lines[i].trim() && !BLOCK.test(lines[i]); i++) buf.push(lines[i].trim());
        // 블록처럼 시작하지만 어느 문법에도 맞지 않는 줄 (예: 문장이 뒤에 붙은 그림 줄)
        if (!buf.length) throw new Error(`읽을 수 없는 줄입니다 (${ctx.slug}): ${line.slice(0, 80)}`);
        out.push({ html: `<p>${inline(buf.join(" "), ctx)}</p>` });
      }
    }
    return out;
  }

  function container(kind, arg, lines) {
    if (kind === "terms") {
      const dl = parseTerms(lines).map(
        (t) => `<div class="term-row" id="${termId(t.key)}"><dt>${inline(t.name, ctx)}</dt><dd>${inline(t.def, ctx)}</dd></div>`,
      );
      return { html: `<dl class="terms">\n${dl.join("\n")}\n</dl>` };
    }
    if (kind === "practice") {
      const m = /^([a-z0-9-]+)\s+(.+)$/.exec(arg);
      if (!m) throw new Error(`:::practice 다음에는 id와 제목이 와야 합니다: ${arg}`);
      const [, id, title] = m;
      if (practice.some((p) => p.id === id)) throw new Error(`실습 id가 겹칩니다: ${ctx.slug}/${id}`);
      practice.push({ id, title: plain(title) });
      return {
        group: "practice",
        html: `<li>
<label class="check"><input type="checkbox" data-key="${esc(`${ctx.slug}:p:${id}`)}"><span>${inline(title, ctx)}</span></label>
<div class="check-body">
${join(blocks(lines.join("\n")))}
</div>
</li>`,
      };
    }
    if (kind === "qa") {
      if (!arg) throw new Error(":::qa 다음에는 질문이 와야 합니다");
      return { group: "qa", html: `<details>\n<summary>${inline(arg, ctx)}</summary>\n<div class="answer">\n${join(blocks(lines.join("\n")))}\n</div>\n</details>` };
    }
    if (kind === "quiz") {
      const m = /^([a-z0-9-]+)\s+(.+)$/.exec(arg);
      if (!m) throw new Error(`:::quiz 다음에는 id와 질문이 와야 합니다: ${arg} (${ctx.slug})`);
      const [, id, question] = m;
      if (quiz.some((q) => q.id === id)) throw new Error(`문제 id가 겹칩니다: ${ctx.slug}/${id}`);
      let i = 0;
      while (i < lines.length && !lines[i].trim()) i++;
      const options = [];
      let answers = null;
      for (; i < lines.length; i++) {
        const o = /^- \[( |x)\] (.+)$/.exec(lines[i]);
        const a = /^= (.+)$/.exec(lines[i]);
        if (o) options.push({ correct: o[1] === "x", text: o[2].trim() });
        else if (a) answers = a[1].split("|").map((x) => x.trim()).filter(Boolean);
        else break;
      }
      const explain = lines.slice(i).join("\n").trim();
      const where = `${ctx.slug}/${id}`;
      if (options.length && answers) throw new Error(`보기와 = 답을 함께 쓸 수 없습니다: ${where}`);
      if (!options.length && !answers) throw new Error(`문제에 보기(- [ ] …)나 답(= …)이 없습니다: ${where}`);
      if (options.length && (options.length < 2 || options.filter((o) => o.correct).length !== 1)) throw new Error(`보기는 둘 이상, 정답([x])은 하나여야 합니다: ${where}`);
      if (!explain) throw new Error(`문제에 해설이 없습니다: ${where}`);
      quiz.push({ id, question: plain(question) });
      const key = esc(`${ctx.slug}:q:${id}`);
      const field = options.length
        ? `<ol class="quiz-options">\n${options
            .map((o, n) => `<li><button type="button" class="quiz-option"${o.correct ? " data-correct" : ""}><span class="quiz-mark" aria-hidden="true">${"ABCDEFGH"[n]}</span><span>${inline(o.text, ctx)}</span></button></li>`)
            .join("\n")}\n</ol>`
        : `<form class="quiz-input" data-answers="${esc(answers.join("\u0001"))}"><input type="text" autocomplete="off" spellcheck="false" aria-label="답" placeholder="답을 적어 보세요"><button type="submit">확인</button></form>`;
      return {
        group: "quiz",
        html: `<div class="quiz" data-quiz="${key}">
<p class="quiz-q">${inline(question, ctx)}</p>
${field}
<p class="quiz-result" aria-live="polite"></p>
<details class="quiz-explain">
<summary>해설 보기</summary>
<div class="answer">
${join(blocks(explain))}
</div>
</details>
</div>`,
      };
    }
    throw new Error(`모르는 상자입니다: :::${kind}`);
  }

  const html = join(blocks(body));
  return { html, toc, practice, quiz };
}

/** 이어진 실습과 질문은 한 목록으로 묶습니다 */
function join(parts) {
  const out = [];
  for (let i = 0; i < parts.length; ) {
    const { group } = parts[i];
    if (!group) {
      out.push(parts[i++].html);
      continue;
    }
    const run = [];
    while (i < parts.length && parts[i].group === group) run.push(parts[i++].html);
    const wrap = { practice: ["<ol class=\"checklist\">", "</ol>"], qa: ["<div class=\"qa\">", "</div>"], quiz: ["<div class=\"quiz-set\" data-quiz-set>", "</div>"] }[group];
    out.push(`${wrap[0]}\n${run.join("\n")}\n${wrap[1]}`);
  }
  return out.join("\n");
}

/** 문단 하나뿐인 목록 항목은 <p> 없이 씁니다 */
function tight(html) {
  const m = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return m && !m[1].includes("<p>") ? m[1] : html;
}
