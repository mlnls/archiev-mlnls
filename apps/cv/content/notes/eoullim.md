@@ tokens
## 시안과 개발이 동시에

어울림은 디자인과 개발이 동시에 진행됐다.
그 사이 디자인 토큰은 v0.2 → v0.3 → v0.5로, 시안은 1차 → 2차 → 수정 시안으로 바뀌었다.

시안이 바뀔 때마다 화면을 하나씩 찾아 고치면 끝이 없다.
파란색 하나가 바뀌었는데 그 색을 쓴 화면이 서른 개면, 서른 군데를 고쳐야 한다.

## 값 대신 이름으로

디자인 토큰은 "값"에 이름을 붙인 것이다.
`#1A73E8` 대신 `primary`라고 부르고, 화면은 이름만 쓴다.
값이 바뀌어도 이름은 그대로라서 화면 코드는 건드릴 필요가 없다.

그래서 색, 글꼴, 그림자는 토큰으로만 쓰게 했다. 화면 코드에 색상값을 직접 적지 않는다.

## 토큰이 화면까지 가는 길

디자이너가 넘긴 `tokens.json`은 style-dictionary를 거쳐 `tokens.css`가 된다.
`tokens.css`에는 토큰이 CSS 변수로 들어 있고, 화면은 `var(--…)`로 그 변수만 가져다 쓴다.

![디자이너의 tokens.json이 style-dictionary를 거쳐 tokens.css의 CSS 변수가 되고, 화면은 그 변수만 쓰는 흐름](tokens.svg "토큰이 화면에 닿기까지")

JSON을 CSS로 바꾸는 규칙은 사내 settings 패키지가 맡는다.
그래서 다른 프로젝트도 같은 규칙으로 같은 모양의 변수를 얻는다.

## 결과

토큰 export만 바꾸면 화면 전체가 한 번에 바뀐다.
시안이 바뀌는 동안에도 화면 개발을 멈추지 않았다.

@@ figma
## 어느 화면이 어느 시안까지?

2주 사이에 시안이 여러 번 바뀌었다.
어느 화면이 어느 시안까지 반영됐는지 헷갈리기 시작했다.

어떤 화면이 최신 시안인지 확인하려면, 코드를 열어 보고 시안과 하나하나 비교하는 수밖에 없었다.

## 커밋에 노드 ID 남기기

Figma에서는 화면의 각 프레임이 고유한 노드 ID를 가진다.
그 ID가 있으면 시안의 정확히 그 프레임으로 바로 간다.

그래서 시안을 반영한 커밋 메시지 끝에 Figma 노드 ID를 남겼다.

![Figma 노드 ID가 남은 커밋 목록](figma-log.webp "git log: 커밋마다 반영한 Figma 노드")

커밋은 어차피 남는다. 따로 표를 관리하지 않아도, 커밋 기록이 그대로 "반영 기록"이 된다.

## 결과

10/22 ~ 11/06 사이 17번 바뀐 시안을 커밋만 보고 따라간다.
`git log --grep=Figma` 한 줄이면 된다.

@@ api
## 연동할 범위가 넓었다

게시글 · 댓글부터 한마디, 검색, 알림, 신고, 관리자 통계까지.
사용자 사이트와 관리자 양쪽에서 붙여야 할 API가 많았다.

## 두 앱, 다른 HTTP 도구

사내 CLI로 만든 Turborepo 모노레포에서 사용자 사이트와 관리자를 함께 개발했다.

사용자 사이트는 Next.js라 `fetch`를 쓰고, 관리자는 Vite 앱이라 axios를 쓴다.
도구가 다르면 실패를 다루는 방식도 달라지기 쉽다.
한쪽은 응답 본문을 읽어 에러를 만들고, 한쪽은 axios가 던지는 에러를 받는다.

## 실패는 한 모양으로

그래서 두 HTTP 계층이 실패를 같은 모양으로 바꾸게 했다.
서버 오류 본문을 읽어서 `ApiError { code, status, details }` 하나로 만든다.

![사용자 사이트의 fetch 래퍼와 관리자의 axios 인스턴스가 모두 같은 ApiError로 실패를 바꾸는 구조](http.svg "두 HTTP 계층, 한 가지 실패 모양")

화면은 `code`로만 가른다. 서버가 보내는 `message`는 쓰지 않는다.
문구는 화면이 정하고, 서버는 "무슨 일이 일어났는지"만 알려 준다.
그래야 서버 문구가 바뀌어도 화면이 흔들리지 않는다.

## 로컬에서만 쿠키가 안 실렸다

연동하면서 하나 더 신경 쓴 게 있다. 로그인 쿠키다.

어울림의 세션 쿠키는 `SameSite=Lax`다.
`SameSite`는 "다른 사이트에서 보낸 요청에도 쿠키를 실을까"를 정한다.
`withlim.kr`과 `api.withlim.kr`은 같은 사이트로 친다. 그래서 배포 환경에서는 쿠키가 잘 실린다.

그런데 로컬에서 `localhost`가 `api.withlim.kr`을 부르면 다른 사이트다. 쿠키가 실리지 않는다.
그래서 로컬에서는 같은 출처의 `/api/*`로 부르고, 개발 서버가 실제 API로 넘기게 했다.
사용자 사이트는 Next.js의 rewrites, 관리자는 Vite의 proxy가 그 일을 한다.

![로컬에서는 localhost의 /api를 개발 서버가 API로 넘겨 쿠키가 실리고, 배포에서는 같은 사이트라 바로 실리는 모습](cookie.svg "로컬과 배포에서 API를 부르는 길")

```ts apps/client/src/lib/api/http.ts
/**
 * 실제로 호출하는 주소
 * - 로컬 개발: '' (같은 출처 /api/*) — next.config.ts 의 rewrites 가 API_ORIGIN 으로 넘긴다
 *   세션 쿠키가 SameSite=Lax 라 localhost → api 호스트 직접 호출(cross-site)에는 쿠키가 실리지 않는다
 * - 배포: API_ORIGIN 직접 호출 (withlim.kr ↔ api.withlim.kr 은 same-site)
 */
export const API_BASE_URL =
  process.env.NODE_ENV === 'development' ? '' : API_ORIGIN;
```

## 결과

게시글, 댓글, 한마디, 검색, 알림, 신고와 관리자 통계까지 실 API에 연동했다.

![어울림 모바일 메인 화면](api-mobile.webp "운영 화면 (모바일)")

@@ editor
## 같은 글, 다른 형식

서버는 본문을 TipTap(ProseMirror) JSON 문서로 주고받는다.
그런데 관리자 에디터는 contentEditable이라 HTML을 다룬다.

같은 글이 서버에서는 JSON, 에디터에서는 HTML이었다.

## 둘은 같은 나무를 다르게 적은 것

처음 보면 완전히 다른 데이터 같지만, 둘 다 문서를 나무(트리)로 적은 것이다.

"안녕 **굵게**"라는 한 문단을 TipTap JSON으로 쓰면 이렇다.

```text TipTap JSON
{ "type": "doc", "content": [
  { "type": "paragraph", "content": [
    { "type": "text", "text": "안녕 " },
    { "type": "text", "text": "굵게", "marks": [{ "type": "bold" }] }
  ] }
] }
```

HTML로 쓰면 이렇다.

```text HTML
<p>안녕 <strong>굵게</strong></p>
```

`paragraph`는 `<p>`, `bold` 마크는 `<strong>`이다.
노드와 마크 이름만 짝지어 주면 서로 바꿀 수 있다.

## 경계에서만 바꾸기

둘을 서로 바꾸는 변환 계층을 만들었다.
중요한 건 **어디서** 바꾸냐였다.

변환은 API 경계(mapper와 api 함수)에서만 한다.
받을 때 JSON을 HTML로, 보낼 때 HTML을 JSON으로.
화면 코드는 처음부터 끝까지 HTML만 본다. JSON이 있다는 것도 모른다.

![서버의 TipTap JSON과 관리자 에디터의 HTML 사이에서 변환 계층이 받을 때와 보낼 때 형식을 바꾸는 구조](editor.svg "변환은 경계에서만")

명세에 서버가 쓰는 노드 목록이 없어서, 노드와 마크 이름은 TipTap StarterKit 기본값을 따랐다.
서버가 다른 이름을 쓰면 이 파일 하나만 고치면 된다.

```ts apps/admin/src/lib/richText.ts
/**
 * 본문 변환 — 서버 본문(RT1 · TipTap/ProseMirror JSON doc) ↔ 관리자 에디터 HTML
 *
 * 관리자 에디터(components/editor/RichEditor)는 contentEditable 이라 HTML 을 다룬다.
 * 서버는 TipTap doc 을 주고받으므로 api 경계(mapper · api 함수)에서만 이 변환을 쓴다.
 */
```

## 결과

관리자가 에디터로 쓴 글이 서버 형식으로 저장되고, 다시 열면 에디터로 돌아온다.

@@ login
## 휴대폰으로 쓰는 서비스

주민들이 주로 휴대폰으로 쓰는 서비스였다.
앱처럼 설치해서 쓰고, 쉽게 들어올 수 있어야 했다.

- PWA 설치 안내를 넣었다
- 로그인 아이디를 휴대폰 번호로 바꿨다
- 로그인하고 나면 보려던 화면으로 돌아가게 했다

## 설치 안내는 환경마다 다르다

PWA는 웹사이트를 앱처럼 홈 화면에 설치하는 방식이다.
그런데 설치하는 방법이 브라우저마다 다르다.

안드로이드 Chrome은 설치 창을 띄울 수 있다. 버튼 하나면 된다.
iOS Safari에는 설치 창이 없다. 사용자가 직접 "공유 → 홈 화면에 추가"를 눌러야 한다.

그래서 설치 화면은 먼저 지금 환경을 알아낸 뒤, 거기에 맞는 안내를 보여 준다.

![설치 화면이 이미 설치됨, 설치 창 가능, iOS Safari, 그 밖의 브라우저 네 경우로 나뉘어 각각 다른 안내를 보여 주는 흐름](install.svg "환경에 따라 다른 설치 안내")

이미 앱으로 열렸는지는 `display-mode: standalone`으로 안다. iOS Safari는 `navigator.standalone`을 따로 본다.

## 로그인 뒤 돌아갈 곳

로그인이 필요한 행동을 하면 로그인 화면으로 보낸다.
이때 가려던 주소를 `?redirect=`로 같이 넘기고, 로그인이 끝나면 그 주소로 돌려보낸다.

![로그인 안 한 상태로 글쓰기를 누르면 가려던 주소를 기억한 채 로그인으로 가고, 로그인 뒤 그 화면으로 돌아오는 흐름](login.svg "로그인 뒤 원래 화면으로")

여기서 조심해야 할 게 있다.
`redirect` 값은 주소창에서 누구나 바꿀 수 있다.
`?redirect=https://가짜사이트`로 바꾼 링크를 뿌리면, 진짜 사이트에서 로그인한 사람을 가짜 사이트로 보낼 수 있다. 이걸 open redirect라고 한다.

그래서 우리 사이트 안의 경로만 따라가게 했다.
`/`로 시작해야 하고, `//`로 시작하면 안 된다. `//가짜사이트`는 브라우저가 다른 도메인으로 읽기 때문이다.

```ts apps/client/src/lib/utils/authFlow.ts
/** 로그인 후 이동할 주소 — 외부 주소로의 이동은 막는다 */
export const getSafeRedirect = (redirect: string | null) =>
  redirect && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/';
```

## 결과

로그인을 해도 보던 흐름이 끊기지 않는다.
설치 안내는 사용자의 휴대폰에 맞춰 나온다.
