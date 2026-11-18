import { svg, box, group, arrow, text, rule } from "../../scripts/diagram.mjs";

/** 시간 막대 한 줄: [[시작x, 끝x, 글자, tone], ...] */
const bars = (y, h, items) => items.map(([x1, x2, s, tone, sub]) => box(x1, y, x2 - x1, h, s, { tone, sub }));

export default {
  hydration: svg(
    178,
    "",
    text(0, 40, "이전", { b: true }),
    ...bars(18, 44, [
      [70, 210, "HTML 받음", "dim", "빈 껍데기"],
      [210, 390, "JS 받기", "dim"],
      [390, 540, "실행 · hydration", "dim"],
      [540, 680, "첫 화면", "bad"],
    ]),
    text(0, 112, "이후", { b: true, tone: "hl" }),
    ...bars(90, 44, [
      [70, 250, "HTML 받음 = 첫 화면", "hl"],
      [250, 430, "JS 받기", "dim"],
      [430, 580, "hydration", "dim", "버튼 연결"],
    ]),
    arrow([[70, 160], [680, 160]], { tone: "m" }),
    text(675, 148, "시간", { anchor: "end", tone: "m" }),
  ),

  font: svg(
    196,
    "",
    text(0, 22, "HTML", { tone: "m" }),
    ...bars(6, 32, [[120, 230, "HTML"]]),
    text(0, 62, "CSS", { tone: "m" }),
    ...bars(46, 32, [[230, 340, "fonts.css"]]),
    text(0, 110, "폰트 · 이전", { tone: "m" }),
    ...bars(90, 40, [
      [340, 480, "다른 도메인 연결", "dim"],
      [480, 600, "폰트", "bad"],
    ]),
    text(0, 160, "폰트 · 이후", { tone: "hl" }),
    ...bars(140, 40, [[230, 360, "폰트", "hl", "preload · 같은 도메인"]]),
    arrow([[230, 38], [230, 140]], { tone: "hl", dash: true, none: true }),
    text(372, 160, "HTML을 읽자마자 같이 받는다", { tone: "hl" }),
  ),

  "spa-pageview": svg(
    214,
    "",
    group(0, 0, 680, 150, "문서 한 장 · 처음에 한 번만 받는다", { tone: "solid" }),
    box(20, 40, 160, 50, "/", { mono: true, sub: "첫 진입" }),
    box(260, 40, 160, 50, "/search", { mono: true, sub: "검색" }),
    box(500, 40, 160, 50, "/profile/…", { mono: true, sub: "법조인 상세" }),
    arrow([[180, 65], [260, 65]], { label: ["pushState", 220, 54] }),
    arrow([[420, 65], [500, 65]], { label: ["pushState", 460, 54] }),
    text(100, 116, "page_view ✓", { anchor: "middle", tone: "hl" }),
    text(340, 116, "이전: 기록 없음", { anchor: "middle", tone: "bad" }),
    text(580, 116, "이전: 기록 없음", { anchor: "middle", tone: "bad" }),
    text(340, 134, "이후: page_view ✓", { anchor: "middle", tone: "hl" }),
    text(580, 134, "이후: page_view ✓", { anchor: "middle", tone: "hl" }),
    text(0, 176, "gtag는 문서를 받을 때 한 번 초기화된다. 그 뒤 화면 이동은 주소만 바뀐다.", { tone: "m" }),
    text(0, 200, "그래서 이동할 때마다 routeChangeComplete 에서 page_view 를 직접 보냈다.", { tone: "m" }),
  ),

  runner: svg(
    316,
    "",
    group(0, 0, 680, 120, "이전 · 밖에서 서버로 들어가려 했다"),
    box(16, 40, 190, 60, "GitHub Actions", { sub: "러너 IP가 실행마다 바뀜" }),
    box(474, 40, 190, 60, "운영 EC2", { sub: "VPN IP에서만 접속 허용", tone: "bad" }),
    arrow([[206, 70], [474, 70]], { tone: "bad", dash: true, label: ["SSH 들어가기 → 막힘", 340, 58] }),
    group(0, 140, 680, 176, "이후 · 안에서 밖으로 나가는 연결만", { titleTone: "hl" }),
    box(16, 190, 190, 60, "GitHub", { sub: "할 일을 쌓아 둠" }),
    box(245, 190, 190, 60, "베스천", { sub: "self-hosted runner", tone: "hl" }),
    box(474, 190, 190, 60, "운영 EC2", { sub: "규칙은 그대로" }),
    arrow([[245, 220], [206, 220]], { tone: "hl" }),
    text(225, 268, "443 · 할 일 있어?", { anchor: "middle", tone: "hl" }),
    text(225, 286, "(밖으로 나가는 요청)", { anchor: "middle", tone: "m" }),
    arrow([[435, 220], [474, 220]], { tone: "hl" }),
    text(455, 268, "SSH", { anchor: "middle", tone: "hl" }),
    text(455, 286, "(원래 허용된 경로)", { anchor: "middle", tone: "m" }),
  ),

  rolling: svg(
    326,
    "",
    box(0, 40, 150, 64, "기존 컨테이너 멈춤", { sub: "지우지 않고 -old 로 보관" }),
    arrow([[150, 72], [190, 72]]),
    box(190, 40, 150, 64, "새 컨테이너 실행", { sub: "같은 포트" }),
    arrow([[340, 72], [380, 72]]),
    box(380, 40, 130, 64, "응답 확인", { sub: "60초 안에?" }),
    arrow([[510, 60], [530, 60], [530, 32], [550, 32]], { tone: "hl" }),
    text(530, 14, "응답 옴", { anchor: "middle", tone: "hl" }),
    box(550, 0, 130, 64, "-old 삭제", { sub: "다음 포트로", tone: "hl" }),
    arrow([[510, 86], [530, 86], [530, 140], [550, 140]], { tone: "bad" }),
    text(522, 112, "응답 없음", { anchor: "end", tone: "bad" }),
    box(550, 104, 130, 72, "이 포트만 복구", { sub: "-old 를 다시 실행\n다음 포트는 그대로", tone: "bad" }),
    arrow([[265, 104], [265, 160], [550, 160]], { tone: "bad", dash: true }),
    text(276, 148, "실행 자체가 실패해도", { tone: "bad" }),
    rule(0, 202, 680),
    text(0, 232, ":3000", { mono: true }),
    ...bars(216, 32, [
      [60, 250, "교체 중", "dim"],
      [250, 680, "새 버전", "hl"],
    ]),
    text(0, 280, ":3001", { mono: true }),
    ...bars(264, 32, [
      [60, 250, "기존 버전 · 요청 받음"],
      [250, 440, "교체 중", "dim"],
      [440, 680, "새 버전", "hl"],
    ]),
    text(0, 312, "한 번에 한 포트만 내려가서, 다른 포트는 계속 요청을 받는다", { tone: "m" }),
  ),

  trust: svg(
    296,
    "",
    text(0, 10, "배포 경로", { tone: "m" }),
    text(320, 10, "여기가 뚫려도 할 수 있는 일", { tone: "m" }),
    ...[
      ["GitHub workflow", "main · dev 브랜치 workflow만 러너 사용", "다른 브랜치 코드는 러너에서 돌지 않는다"],
      ["러너 계정 (베스천)", "sudo 없음 · 넘기는 Secret 0개", "꺼낼 비밀값도, 올릴 권한도 없다"],
      ["SSH 키", "authorized_keys 의 command= 로 묶음", "보낸 명령은 실행되지 않는다"],
      ["deploy-lawpeople.sh", "이미지 이름 · 포트를 정규식으로 검사", "정해진 이미지로 교체하는 일 하나"],
    ].flatMap(([name, sub, can], i) => {
      const y = 26 + i * 70;
      return [
        box(0, y, 290, 52, name, { sub, mono: i === 3 }),
        i < 3 ? arrow([[145, y + 52], [145, y + 70]]) : "",
        arrow([[290, y + 26], [316, y + 26]], { tone: "m", dash: true, none: true }),
        text(320, y + 26, can, { tone: "hl" }),
      ];
    }),
  ),

  version: svg(
    120,
    "",
    box(0, 30, 120, 60, "PR 라벨", { sub: "major · minor · 없음" }),
    arrow([[120, 60], [150, 60]]),
    box(150, 30, 120, 60, "버전 계산", { sub: "최신 태그 + 라벨" }),
    arrow([[270, 60], [300, 60]]),
    box(300, 30, 110, 60, "빌드 · 배포", { sub: "운영 서버" }),
    arrow([[410, 60], [440, 60]], { tone: "hl" }),
    text(425, 18, "성공했을 때만", { anchor: "middle", tone: "hl" }),
    box(440, 30, 110, 60, "태그", { sub: "v1.5.0", tone: "hl" }),
    arrow([[550, 60], [580, 60]], { tone: "hl" }),
    box(580, 30, 100, 60, "Release", { sub: "변경 내역", tone: "hl" }),
  ),
};
