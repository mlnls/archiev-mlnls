import { svg, box, group, arrow, text } from "../../scripts/diagram.mjs";

export default {
  roles: svg(
    210,
    "",
    box(0, 75, 180, 60, "성취도 평가 결과", { sub: "같은 데이터", tone: "hl" }),
    ...[
      ["본사", "전체 통계 · 대시보드 · 분석", 0],
      ["학당", "우리 반 · 반 관리", 75],
      ["학습자", "내 성적 · 개인 리포트", 150],
    ].flatMap(([who, what, y]) => [
      arrow([[180, 105], [230, 105], [230, y + 30], [280, y + 30]], { tone: "hl" }),
      box(280, y, 110, 60, who, { tone: "hl" }),
      arrow([[390, y + 30], [420, y + 30]], { tone: "m" }),
      text(430, y + 30, what),
    ]),
  ),

  print: svg(
    266,
    "",
    group(0, 0, 250, 180, "화면 · 이어진 한 장"),
    box(16, 34, 218, 60, ".print-page", { mono: true, sub: "리포트 앞부분" }),
    box(16, 104, 218, 60, ".print-page.more-scope", { mono: true, sub: "분량이 많은 부분" }),
    arrow([[250, 90], [300, 90]], { tone: "hl", label: ["window.print()", 275, 76] }),
    group(300, 0, 180, 180, "A4 1쪽", { tone: "solid", titleTone: "hl" }),
    box(316, 34, 148, 130, ".print-page", { mono: true, sub: "전체 zoom 0.95" }),
    group(500, 0, 180, 180, "A4 2쪽", { tone: "solid", titleTone: "hl" }),
    box(516, 34, 148, 130, ".more-scope", { mono: true, sub: "zoom 0.75 로\n한 번 더 줄임" }),
    text(0, 206, "@page { size: A4; margin: 10mm }  ·  .print-page { break-after: page }", { mono: true, tone: "m" }),
    text(0, 232, "A4에서 여백을 빼면 인쇄 폭은 190mm, 약 718px. 화면보다 좁다.", { tone: "m" }),
    text(0, 254, "버튼 · 머리말은 .hide-on-print 로 숨기고, 배경색은 print-color-adjust: exact 로 살린다.", { tone: "m" }),
  ),
};
