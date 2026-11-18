import { svg, box, group, arrow, text } from "../../scripts/diagram.mjs";

// test-results/loadtest-20261007-1800.txt 의 /kor/main/ 결과 그대로
const LOAD = [
  { c: 10, rps: 49.73, p50: 178, p99: 597 },
  { c: 25, rps: 55.88, p50: 433, p99: 661 },
  { c: 50, rps: 55.3, p50: 864, p99: 3565 },
  { c: 100, rps: 53.83, p50: 1722, p99: 10092 },
  { c: 200, rps: 53.02, p50: 2542, p99: 12514 },
];

/** 작은 꺾은선 차트 한 칸. series: [{ key, cls, label }] */
function panel(x0, title, yMax, ticks, fmt, series) {
  const L = x0 + 44;
  const R = x0 + 300;
  const T = 40;
  const B = 190;
  const xs = (i) => L + 12 + (i * (R - L - 24)) / (LOAD.length - 1);
  const ys = (v) => B - (v / yMax) * (B - T);
  const out = [text(x0, 14, title, { b: true })];
  for (const t of ticks) out.push(`<path class="grid" d="M${L} ${ys(t)} L${R} ${ys(t)}"/>`, text(L - 8, ys(t), fmt(t), { anchor: "end", tone: "m" }));
  LOAD.forEach((d, i) => out.push(text(xs(i), B + 18, String(d.c), { anchor: "middle", tone: "m" })));
  out.push(text((L + R) / 2, B + 40, "동시 접속 (명)", { anchor: "middle", tone: "m" }));
  for (const s of series) {
    const pts = LOAD.map((d, i) => [xs(i), ys(d[s.key])]);
    out.push(`<path class="line ${s.cls}" d="${pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")}"/>`);
    LOAD.forEach((d, i) => out.push(`<circle class="pt ${s.cls}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="4.5"><title>동시 ${d.c}명 · ${s.label} ${fmt(d[s.key], true)}</title></circle>`));
    if (s.label) {
      const [lx, ly] = pts[pts.length - 1];
      out.push(text(lx - 8, ly - 14, s.label, { anchor: "end" }));
    }
  }
  return out;
}

export default {
  rewrite: svg(
    262,
    "",
    `<rect class="b fill" x="250" y="0" width="150" height="262" rx="6"/>`,
    text(325, 18, "Caddy", { anchor: "middle", b: true }),
    ...[
      ["GET /eng/about", "rewrite", "Apache가 /kor/about 실행", "주소창은 /eng/ 그대로", "hl", 46],
      ["GET /kor/about", "301", "/eng/about 로 이동", "주소창이 /eng/ 로 바뀜", undefined, 124],
      ["POST /kor/…", "그대로", "Apache가 /kor/… 실행", "폼 전송이 깨지지 않게", "dim", 202],
    ].flatMap(([req, how, res, note, tone, y]) => [
      box(0, y, 200, 50, req, { mono: true }),
      arrow([[200, y + 25], [470, y + 25]], { tone: tone === "hl" ? "hl" : "m" }),
      text(325, y + 12, how, { anchor: "middle", tone: tone === "hl" ? "hl" : "m", mono: true }),
      box(470, y, 210, 50, res, { sub: note, tone }),
    ]),
  ),

  pipeline: svg(
    150,
    "",
    ...["main 머지", "바뀐 PHP\n문법 검사", "배포", "Caddy\n설정 검사", "무중단 reload"].flatMap((s, i) => {
      const x = i * 140;
      return [box(x, 10, 120, 60, s, { tone: i === 4 ? "hl" : undefined }), i < 4 ? arrow([[x + 120, 40], [x + 140, 40]], { tone: "hl" }) : ""];
    }),
    ...[1, 2, 3].map((i) => arrow([[i * 140 + 60, 70], [i * 140 + 60, 110]], { tone: "bad", dash: true, none: true })),
    arrow([[200, 110], [440, 110], [440, 110]], { tone: "bad", dash: true, none: true }),
    arrow([[440, 110], [470, 110]], { tone: "bad", dash: true }),
    box(470, 92, 210, 40, "실패하면 복구", { tone: "bad" }),
    text(200, 132, "어느 단계에서 실패해도", { tone: "bad" }),
  ),

  load: svg(
    240,
    "",
    panel(0, "초당 처리량", 60, [0, 20, 40, 60], (v, long) => (long ? `${v}건` : String(v)), [{ key: "rps", cls: "s1", label: "" }]),
    panel(360, "응답 시간", 14000, [0, 5000, 10000], (v, long) => (long ? `${v.toLocaleString()}ms` : v ? `${v / 1000}초` : "0"), [
      { key: "p50", cls: "s1", label: "p50" },
      { key: "p99", cls: "s2", label: "p99" },
    ]),
  ),

  queue: svg(
    170,
    "",
    box(0, 50, 110, 60, "요청", { sub: "동시 50명" }),
    arrow([[110, 80], [150, 80]]),
    group(150, 30, 270, 100, "Apache 대기열 · 버리지 않고 줄 세움"),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect class="b dim" x="${170 + i * 34}" y="62" width="26" height="50" rx="4"/>`),
    arrow([[420, 80], [460, 80]], { tone: "hl" }),
    box(460, 50, 220, 60, "처리", { sub: "초당 약 55건이 한계", tone: "hl" }),
    text(0, 156, "기다리는 시간 = 줄 선 사람 ÷ 처리 속도 = 50 ÷ 55 ≈ 0.9초  (리틀의 법칙 L = λ × W)", { tone: "m" }),
  ),

  limits: svg(
    196,
    "",
    box(0, 40, 110, 70, "요청"),
    arrow([[110, 75], [140, 75]]),
    box(140, 40, 120, 70, "Caddy", { sub: "본문 상한 8MB", tone: "hl" }),
    arrow([[260, 75], [290, 75]]),
    group(280, 0, 400, 156, "컨테이너 · 메모리 상한 1g", { tone: "solid" }),
    box(290, 40, 120, 70, "Apache", { sub: "LimitRequestBody\n8MB", tone: "hl" }),
    arrow([[410, 75], [430, 75]]),
    box(430, 40, 120, 70, "PHP 본문 파싱", { sub: "php_admin_value", tone: "hl" }),
    arrow([[550, 75], [570, 75]]),
    box(570, 40, 100, 70, "스크립트", { sub: "ini_set()", tone: "bad" }),
    arrow([[490, 110], [490, 134]], { tone: "m", none: true }),
    text(490, 144, "본문은 여기서 이미 다 읽힌다", { anchor: "middle", tone: "m" }),
    text(620, 128, "이미 늦다", { anchor: "middle", tone: "bad" }),
    text(0, 184, "상한은 앞에서부터 건다. 앞에서 막힐수록 PHP는 그 요청을 보지도 않는다.", { tone: "m" }),
  ),
};
