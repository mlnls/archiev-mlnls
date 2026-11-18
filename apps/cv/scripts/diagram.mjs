// 글 속 구조도를 그리는 작은 도구. 색은 전부 style.css 의 변수(.dg 아래)를 따라가서 다크 모드에서도 그대로 맞습니다.
// 좌표는 px, 그림 폭은 W(680) 고정. 글자는 13px(.m 은 12px) 기준으로 상자 크기를 잡습니다.

export const W = 680;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 그림 전체. label 은 화면 낭독기용 설명입니다. */
export function svg(h, label, ...parts) {
  return `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">${parts.flat().join("")}</svg>`;
}

/** 글자. o.tone: m(흐림) · hl(강조색) · bad(빨강), o.b: 굵게, o.mono: 고정폭, o.anchor: start|middle|end */
export function text(x, y, s, o = {}) {
  const cls = [o.tone, o.b && "b", o.mono && "mono"].filter(Boolean).join(" ");
  return `<text x="${x}" y="${y}"${cls ? ` class="${cls}"` : ""} text-anchor="${o.anchor ?? "start"}" dominant-baseline="middle">${esc(s)}</text>`;
}

/**
 * 상자. s 의 \n 은 줄바꿈, o.sub 는 아래에 흐린 글자로 붙는 줄(들).
 * o.tone: hl(강조 테두리) · dim(점선) · bad(빨강 테두리) · fill(옅은 바탕)
 */
export function box(x, y, w, h, s, o = {}) {
  const lines = String(s).split("\n").map((t) => ({ t, sub: false }));
  const sub = o.sub ? String(o.sub).split("\n").map((t) => ({ t, sub: true })) : [];
  const all = [...lines, ...sub];
  const lh = 18;
  const top = y + h / 2 - ((all.length - 1) * lh) / 2;
  const tone = o.tone ? ` ${o.tone}` : "";
  const body = all
    .map(({ t, sub: isSub }, i) =>
      text(x + w / 2, top + i * lh, t, { anchor: "middle", tone: isSub ? "m" : o.textTone, b: !isSub && o.bold && i === 0, mono: !isSub && o.mono }),
    )
    .join("");
  return `<g class="node"><rect class="b${tone}" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>${body}</g>`;
}

/** 점선으로 묶는 영역. 제목은 왼쪽 위 안쪽에 붙습니다. */
export function group(x, y, w, h, title, o = {}) {
  return `<g class="grp"><rect class="g${o.tone ? ` ${o.tone}` : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>${
    title ? text(x + 12, y + 16, title, { tone: o.titleTone ?? "m" }) : ""
  }</g>`;
}

/**
 * 화살표. pts 는 [[x,y], ...] 꺾은선, 마지막 점에 화살촉이 붙습니다.
 * o.tone: hl · bad · m, o.dash: 점선, o.both: 양쪽 화살촉, o.label: [글자, x, y, 정렬]
 */
export function arrow(pts, o = {}) {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const tone = o.tone ? ` ${o.tone}` : "";
  const head = (a, b) => {
    const [x1, y1] = a;
    const [x2, y2] = b;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = 8;
    const H = 4;
    const p = (dx, dy) => `${(x2 + dx).toFixed(1)},${(y2 + dy).toFixed(1)}`;
    const bx = -L * Math.cos(ang);
    const by = -L * Math.sin(ang);
    const nx = -H * Math.sin(ang);
    const ny = H * Math.cos(ang);
    return `<polygon class="ah${tone}" points="${p(0, 0)} ${p(bx + nx, by + ny)} ${p(bx - nx, by - ny)}"/>`;
  };
  const n = pts.length;
  const heads = (o.none ? "" : head(pts[n - 2], pts[n - 1])) + (o.both ? head(pts[1], pts[0]) : "");
  const label = o.label ? text(o.label[1], o.label[2], o.label[0], { anchor: o.label[3] ?? "middle", tone: o.labelTone ?? "m" }) : "";
  return `<path class="l${tone}${o.dash ? " dash" : ""}" d="${d}"/>${heads}${label}`;
}

/** 가로 구분선 */
export function rule(x1, y, x2) {
  return `<path class="r" d="M${x1} ${y} L${x2} ${y}"/>`;
}
