// 책의 차례와 첫 화면 안내. 각 장의 본문은 content/chapters/<slug>.md 에 있습니다.
// 실습 체크의 열쇠는 "<slug>:p:<id>", 다 읽음은 "<slug>:read"입니다. 공개한 뒤에는 slug와 id를 바꾸지 않습니다.

export const book = {
  title: "컴퓨터 기초, 처음부터 끝까지",
  description:
    "전원을 켜면 무슨 일이 일어나는지부터 운영체제, 네트워크, 서버, 자료구조와 알고리즘, 데이터베이스, 보안과 설계까지. 프론트엔드 개발자가 컴퓨터 기초를 처음부터 끝까지 이어서 읽는 책입니다.",
  summary:
    "전원 버튼을 누르는 순간부터 시작해 운영체제가 올라오고, 프로그램이 돌고, 데이터가 선을 타고 다른 컴퓨터의 서버에 닿았다가 돌아오기까지를 한 줄로 이어서 읽습니다. 그 위에서 자료구조와 알고리즘, 데이터베이스, 보안, 설계를 다루고, Windows, macOS, Linux가 어디서 어떻게 다른지도 장마다 비교합니다.",
  tips: [
    "앞에서부터 순서대로 읽습니다. 뒤 장은 앞 장의 용어를 그대로 씁니다.",
    "밑줄 친 용어에 마우스를 올리면 뜻이 보이고, 누르면 용어 사전으로 갑니다.",
    "직접 해보기는 꼭 터미널을 열고 따라 칩니다. macOS, Windows, Linux 명령을 함께 적었습니다.",
    "점검 질문은 답을 먼저 소리 내어 말해 보고 펼칩니다. 막히면 그 절로 돌아갑니다.",
    "한 장을 마치면 맨 아래 '다 읽었어요'를 체크합니다. 기록은 이 브라우저에만 남습니다.",
  ],
};

export const parts = [
  { title: "컴퓨터가 켜지기까지", chapters: ["bits", "hardware", "boot"] },
  { title: "운영체제", chapters: ["os", "program", "process", "memory", "io"] },
  { title: "네트워크: 데이터가 오가는 길", chapters: ["network", "link", "ip", "transport", "dns", "http"] },
  { title: "서버", chapters: ["server", "open-server", "serve"] },
  { title: "자료구조와 알고리즘", chapters: ["data-structures", "trees", "algorithms"] },
  { title: "데이터베이스", chapters: ["database", "transaction"] },
  { title: "보안과 설계", chapters: ["security", "system-design", "software"] },
  { title: "처음부터 끝까지", chapters: ["journey"] },
];

/** 차례에는 있지만 아직 쓰지 않은 장. 파일이 없어도 빌드가 멈추지 않고, 차례에 "준비 중"으로 보입니다 */
export const upcoming = {
  journey: "주소창에 엔터를 누른 순간부터 이 페이지가 화면에 그려지기까지, 앞의 모든 장을 한 번에 따라갑니다.",
};

/** 차례를 짤 때 목차를 직접 열어 본 저장소들. 별 수는 2026년 11월 24일 기준입니다 */
export const sources = [
  { repo: "codecrafters-io/build-your-own-x", stars: 565070, used: "웹 서버, 네트워크 스택, 셸을 직접 만들어 보는 실습" },
  { repo: "donnemartin/system-design-primer", stars: 378965, used: "리버스 프록시, 로드 밸런서, CDN, 캐시 (서버 장)" },
  { repo: "jwasham/coding-interview-university", stars: 364898, used: "컴퓨터 구조, 운영체제, 네트워크를 공부하는 순서" },
  { repo: "awesome-selfhosted/awesome-selfhosted", stars: 339962, used: "서버로 직접 돌릴 수 있는 것들 (서버로 할 수 있는 것)" },
  { repo: "trimstray/the-book-of-secret-knowledge", stars: 260898, used: "네트워크 진단과 셸 도구" },
  { repo: "ossu/computer-science", stars: 211476, used: "대학 컴퓨터공학 과정의 과목 순서" },
  { repo: "yangshun/tech-interview-handbook", stars: 143628, used: "면접에서 묻는 기초 주제" },
  { repo: "mtdvio/every-programmer-should-know", stars: 100698, used: "지연 시간 숫자, 메모리, 문자열과 시간" },
  { repo: "bregman-arie/devops-exercises", stars: 86923, used: "Linux, 네트워크, 서버 운영 질문" },
  { repo: "alex/what-happens-when", stars: 43496, used: "키를 누른 순간부터 화면이 그려지기까지 (마지막 장)" },
  { repo: "0xAX/linux-insides", stars: 33781, used: "Linux 부팅 과정과 커널 초기화" },
  { repo: "cfenollosa/os-tutorial", stars: 30836, used: "부트 섹터와 부트로더" },
  { repo: "jbee37142/Interview_Question_for_Beginner", stars: 21838, used: "네트워크, 운영체제 질문 목록" },
  { repo: "gyoogle/tech-interview-for-developer", stars: 17702, used: "컴퓨터 구조, 운영체제, 네트워크 목차" },
  { repo: "WooVictory/Ready-For-Tech-Interview", stars: 4980, used: "네트워크, 운영체제 질문 목록" },
  { repo: "brave-people/brave-tech-interview", stars: 4474, used: "현직자가 해설하는 기술 면접 질문" },
  { repo: "Seogeurim/CS-study", stars: 1380, used: "운영체제, 네트워크 정리 노트 목차" },
];
