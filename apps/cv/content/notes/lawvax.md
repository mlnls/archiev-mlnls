@@ ssr
## SEO 100점인데 지적서를 받았다

리뉴얼한 로백스 홈페이지는 CRA로 만든 SPA였다.
화면은 멀쩡했고, Lighthouse SEO 점수도 100점이었다.

그런데 SEO · GEO 지적서를 받았다.
읽어 보니 문제는 화면이 아니라 서버가 처음 내려주는 HTML에 있었다.

## 모든 주소가 같은 HTML이었다

SPA는 어떤 주소로 들어와도 같은 `index.html`을 내려준다.
로백스도 모든 주소가 같은 2,090바이트 HTML을 돌려줬고, 그래서 페이지마다 제목과 설명이 전부 같았다.

사람은 JS가 실행된 뒤의 화면을 보니까 알아챌 수가 없었다.
하지만 GPTBot, ClaudeBot 같은 AI 크롤러는 JS를 실행하지 않는다. 이들이 본 건 아래처럼 빈 페이지였다.

![JS를 끄고 연 이전 업무분야 페이지. 흰 화면만 보인다](ssr-before.webp "이전 SPA: JS를 끄고 연 업무분야 페이지")

Lighthouse가 이걸 못 잡은 이유도 같다. Lighthouse는 JS를 다 실행한 뒤에 검사해서 크롤러가 보는 화면을 보지 못한다.
그래서 이후로는 원본 HTML을 직접 받아 본문 글자 수를 세는 식으로 확인했다.

## 서버에서 본문을 그리게

CRA SPA를 Next.js App Router로 옮겼다.
리뉴얼한 화면을 다시 만들고 싶지는 않아서, 한 페이지를 세 층으로 나눴다.

- `page`: 메타데이터만 만든다
- `Container`: 서버에서 데이터를 받고 JSON-LD를 만든다
- `View`: 화면만 그린다. 리뉴얼 화면을 그대로 옮겼다

업무분야 상세 페이지의 `page.tsx`는 이 정도만 한다.

```tsx src/app/(client)/practice-detail/page.tsx
export async function generateMetadata(props: Props): Promise<Metadata> {
  // ...
  return buildPageMetadata({
    title: `${workField} 업무분야`,
    path: '/practice-detail',
    // ?title= 로 들어와도 공식 주소는 ?workField= 하나로 맞춘다.
    params: { workField },
  });
}

export default async function PracticeDetailPage(props: Props) {
  // 요청 시점 렌더링 보장 (정적 생성 방지)
  await connection();
  const query = await readSearchQuery(props.searchParams);
  return <PracticeDetailContainer key={query} query={query} />;
}
```

렌더링 방식은 페이지마다 따로 골랐다.
메인은 ISR, 서버 데이터가 없는 업무분야 목록과 연락처는 SSG, 쿼리마다 내용이 다른 상세 페이지는 SSR, 관리자는 CSR이다.

하나 헷갈렸던 건 `'use client'`였다.
클라이언트 컴포넌트도 서버에서 한 번 그려지지만, 마운트된 뒤에 그리는 내용은 서버 HTML에 들어가지 않는다.

## 결과

같은 페이지를 JS를 끄고 다시 열면 이제 본문이 보인다.

![JS를 끄고 연 Next.js 업무분야 페이지. 제목과 본문이 보인다](ssr-after.webp "Next.js로 옮긴 뒤: JS를 끄고 연 같은 페이지")

- 업무분야 페이지의 첫 HTML 본문 **0 → 680자**
- JS 전송량 **2,512KB → 251KB** (−90%)
- 페이지 총 전송량 −86%, Total Blocking Time −61%

모두 같은 머신, 같은 크롬에서 직접 잰 값이다.

@@ urls
## 옛 주소가 아직 살아 있었다

새 사이트는 주소 체계가 달랐다.
그런데 이전 사이트의 `/intro`, `/workfield/...` 같은 주소가 외부 링크와 검색 결과에 그대로 남아 있었다.
도메인도 lvx.co.kr에서 lawvax.co.kr로 옮겨야 했다.

## 주소는 308로

레거시 주소를 21개 패턴으로 정리해서 새 주소로 **308** 리디렉트했다.
`next.config.ts`에 옛 주소와 새 주소를 표처럼 적어 두고, 전부 영구 이동으로 돌린다.

```ts next.config.ts
const LEGACY_REDIRECTS: { source: string; destination: string }[] = [
  { source: '/intro', destination: '/' },
  { source: '/workfield', destination: '/practice' },
  { source: '/workfield/detail/:workField', destination: '/practice-detail?workField=:workField' },
  { source: '/members/profile/:id', destination: '/members/detail?id=:id' },
  { source: '/news/post/:id', destination: '/news/detail?id=:id' },
  // ...
];

async redirects() {
  return LEGACY_REDIRECTS.map((redirect) => ({ ...redirect, permanent: true }));
},
```

한글이 들어간 주소는 한 번 더 신경 써야 했다.
Next가 destination의 쿼리를 한 번 디코딩한 뒤 Location 헤더에 넣기 때문에, 한글은 두 번 인코딩해 두었다.

## 도메인은 301로

옛 도메인은 앱까지 오기 전에 Caddy에서 **301**로 넘겼다. 경로와 쿼리는 그대로 붙여 보낸다.

```caddyfile Caddyfile
{$REDIRECT_DOMAINS::8081} {
	redir https://{$DOMAIN:localhost}{uri} permanent
}
```

마지막으로 canonical과 sitemap이 같은 함수에서 주소를 만들게 했다.
둘이 따로 주소를 만들면 언젠가는 어긋난다.

## 결과

![curl로 확인한 옛 도메인 301과 레거시 주소 308 응답](urls-curl.webp "운영 서버 응답: 옛 도메인은 301, 레거시 주소는 308")

이제 어느 옛 주소로 들어와도 공식 주소 하나로 모인다.

작업하면서 크롤러는 본문보다 상태 코드를 먼저 읽는다는 걸 알게 됐다.
soft 404, 308, noindex 헤더 하나가 검색 결과를 바꾼다.

@@ cache
## 정적으로 만들면 생기는 일

정적으로 만든 페이지는 빠르다.
대신 관리자가 글을 고쳐도 캐시가 남아 있어서 바로 반영되지 않는다.

법인 소식이나 언론보도는 관리자가 올리고 나서 언제 보이는지를 바로 확인하는 글이라, 이 지연이 그대로 불편이 됐다.

## 저장한 글의 캐시만 비우기

서버에서 데이터를 가져올 때 요청마다 태그를 달았다.
그리고 관리자 화면에서 저장이나 삭제가 성공하면 `/api/revalidate`를 불러, 그 태그의 캐시만 `revalidateTag`로 비운다.

```ts src/app/api/revalidate/route.ts
/**
 * 공개 페이지 캐시 즉시 무효화. 관리자 화면에서 저장·삭제가 성공한 뒤 호출한다.
 *   POST /api/revalidate  { tags: ['news', 'search'] }  (헤더: Access-Token)
 */
export async function POST(request: NextRequest) {
  // 관리자 토큰 확인 ...
  const tags = Array.isArray(body?.tags) ? body.tags.filter(isCacheTag) : [];
  const uniqueTags = [...new Set(tags)];
  uniqueTags.forEach((tag) => revalidateTag(tag));
  return NextResponse.json({ revalidated: uniqueTags });
}
```

관리자 토큰은 브라우저에만 있어서 따로 비밀키를 둘 수가 없었다.
그래서 백엔드 관리자 API를 한 번 불러 보고, 토큰이 유효할 때만 캐시를 비운다.

이 호출이 실패해도 캐시 주기가 지나면 반영된다. 소식 · 언론보도는 5분, 구성원 · 업무분야는 1시간이다.

관리자 쪽 편의도 하나 더했다. 유튜브 링크만 넣으면 제목과 게시일이 채워진다.

## 결과

![운영 응답 헤더의 x-nextjs-cache와 cache-control](cache-header.webp "운영 응답 헤더: Next.js 캐시에서 나간 응답")

정적 페이지의 속도는 그대로 두고, 관리자가 저장한 글은 바로 보인다.

@@ geo
## 검색엔진과 AI가 관계를 몰랐다

로백스라는 법인, 그 구성원, 구성원이 쓴 글.
사람은 화면을 보면 이 셋의 관계를 바로 알지만, 검색엔진과 AI는 알 수 없었다. 구조화 데이터가 하나도 없었다.

AI가 답변에 인용할 때 그대로 가져갈 만한 짧고 정확한 문장도 없었다.

## JSON-LD 그래프로 묶기

법인 · 구성원 · 글을 같은 `@id`로 연결한 JSON-LD 그래프로 묶었다.
원칙은 하나였다. **화면에 없는 정보는 채우지 않는다.**

그리고 업무분야 페이지 맨 앞에 두 문장짜리 요약과 `<time dateTime>`을 두었다.
AI가 인용할 문장과 그 글이 언제 쓰였는지를 가장 먼저 찾을 수 있게.

## 결과

![업무분야 페이지 HTML에서 뽑은 JSON-LD 타입 목록](geo-jsonld.webp "형사 업무분야 페이지의 첫 HTML에 들어 있는 JSON-LD 타입")

구조화 데이터 타입이 **0 → 7종**이 됐다. (LegalService, Person, Service, BreadcrumbList, WebSite 등)

해 보니 GEO는 SEO 위에 "그 페이지가 말하는 사실이 정확한가"가 더해진 일이었다.

@@ bundle
## 쓰지 않는 코드를 받고 있었다

Chrome Coverage로 첫 진입 JS를 재 봤다.
대부분이 그 화면에서 쓰이지 않는 코드였다.

원인은 관리자 코드였다. 관리자와 사용자 코드가 한 번들에 묶여 있어서, 홈페이지에 들어온 방문자도 관리자 화면 코드를 같이 받고 있었다.

## 관리자 라우트 떼어 내기

먼저 관리자 라우트를 `React.lazy` + `Suspense`로 나눴다.
관리자 화면에 들어갈 때만 그 코드를 받는다.

그것만으로는 다 빠지지 않았다.
루트 배럴 파일 하나를 import하면, 그 파일이 export하는 관리자 코드까지 딸려 들어왔다.
그래서 루트 배럴 export와 import 경로를 정리해서 사용자 번들에 관리자 코드가 섞이지 않게 했다.

## 결과

첫 진입 JS **7.2MB → 171KB**
