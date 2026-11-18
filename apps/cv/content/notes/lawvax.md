@@ ssr
## SEO 100점인데 지적서를 받았다

리뉴얼한 로백스 홈페이지는 CRA로 만든 SPA였다.
화면은 멀쩡했고, Lighthouse SEO 점수도 100점이었다.

그런데 SEO · GEO 지적서를 받았다.
읽어 보니 문제는 화면이 아니라 서버가 처음 내려주는 HTML에 있었다.

## 브라우저와 크롤러는 다른 걸 본다

이걸 이해하려면 SPA가 화면을 어떻게 그리는지부터 봐야 한다.

SPA 서버는 사실 HTML을 거의 만들지 않는다.
어느 주소로 들어오든 같은 `index.html`을 주는데, 그 안에는 빈 `<div id="root">`와 JS 파일 주소만 있다.
화면은 브라우저가 그 JS를 받아 실행하면서 그린다.

![이전 SPA와 이후 Next.js에서 브라우저와 AI 크롤러가 받는 것](ssr-flow.svg "같은 주소를 열었을 때 받는 것")

사람은 브라우저로 보니까 아무 문제가 없다. JS가 돌고 나면 화면이 다 채워진다.
하지만 GPTBot, ClaudeBot 같은 AI 크롤러는 JS를 실행하지 않는다.
처음 받은 HTML이 곧 그 페이지의 전부다.

로백스는 모든 주소가 같은 2,090바이트 HTML을 돌려줬다.
페이지마다 제목과 설명이 같았고, 본문은 0자였다.
JS를 끄고 열어 보면 크롤러가 본 화면이 그대로 나온다.

![JS를 끄고 연 이전 업무분야 페이지. 흰 화면만 보인다](ssr-before.webp "이전 SPA: JS를 끄고 연 업무분야 페이지")

Lighthouse가 100점을 준 것도 같은 이유다.
Lighthouse는 브라우저에서 JS를 다 실행한 뒤에 검사한다. 크롤러가 받는 첫 HTML은 보지 않는다.

그래서 확인하는 방법부터 바꿨다.
점수 대신, 원본 HTML을 직접 받아서 본문 글자 수를 셌다.

## 서버가 본문까지 그리게

방향은 하나였다. 서버가 처음 주는 HTML에 본문이 들어 있어야 한다.
그래서 CRA SPA를 Next.js App Router로 옮겼다.

App Router에서는 컴포넌트가 기본으로 서버에서 돈다.
서버가 데이터를 받아 HTML까지 만들어 보내고, 브라우저는 받은 HTML을 바로 보여 준다.
JS는 그다음에 내려와서 버튼 같은 동작만 연결한다. 이걸 hydration이라고 부른다.

다만 리뉴얼한 화면을 처음부터 다시 만들고 싶지는 않았다.
그래서 한 페이지를 세 층으로 나눴다.

![page, Container, View 세 층으로 나눈 페이지 구조](layers.svg "한 페이지를 세 층으로")

서버에서만 하는 일(메타데이터, 데이터 조회, JSON-LD)은 `page`와 `Container`가 맡는다.
`View`는 받은 값으로 화면만 그린다. 그래서 리뉴얼 화면은 `View`로 옮겨 오기만 하면 됐다.

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

## 페이지마다 그리는 시점이 다르다

모든 페이지를 요청마다 새로 그릴 필요는 없다.
내용이 언제 바뀌는지에 따라 HTML을 만드는 시점을 골랐다.

| 페이지 | 방식 | HTML을 만드는 시점 |
|---|---|---|
| 업무분야 목록 · 연락처 | SSG | 빌드할 때 한 번. 서버 데이터가 없다 |
| 메인 | ISR | 만들어 두고, 정해진 주기가 지나면 다시 만든다 |
| 업무분야 상세 | SSR | 요청마다. 쿼리마다 내용이 다르다 |
| 관리자 | CSR | 브라우저에서. 검색에 나올 필요가 없다 |

하나 헷갈렸던 건 `'use client'`였다.
클라이언트 컴포넌트도 서버에서 한 번 그려지긴 한다.
하지만 서버에서는 `useEffect`가 돌지 않는다. 마운트된 뒤에 데이터를 받아 그리는 부분은 서버 HTML에 빈 채로 나간다.
본문은 서버에서 받은 값으로 그려야 HTML에 남는다.

## 같은 페이지를 JS를 끄고 다시

이제 JS를 끄고 열어도 본문이 보인다.

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

옛 주소를 그냥 두면 들어온 사람은 404를 보고, 검색엔진은 그 주소가 쌓아 온 평가를 버린다.

## 리디렉트는 상태 코드로 말한다

리디렉트는 "이 주소는 이제 저기 있다"를 상태 코드로 알려 주는 일이다.
검색엔진은 이 코드를 보고 옛 주소를 어떻게 다룰지 정한다.

| 코드 | 뜻 | 검색엔진 | 요청 메서드 |
|---|---|---|---|
| 301 | 영구 이동 | 새 주소로 바꿔 색인 | POST가 GET으로 바뀔 수 있다 |
| 308 | 영구 이동 | 새 주소로 바꿔 색인 | 메서드와 본문을 그대로 유지 |
| 302 · 307 | 임시 이동 | 옛 주소를 계속 들고 있다 | |

주소 체계가 바뀐 거니까 임시가 아니라 영구 이동이어야 했다.

## 요청 하나를 따라가 보면

옛 도메인의 옛 주소로 들어온 요청은 두 번 넘겨져서 공식 주소에 닿는다.

![옛 도메인 옛 주소에서 301, 308을 거쳐 공식 주소에 닿는 과정](redirect.svg "요청 하나가 공식 주소에 닿기까지")

도메인과 주소 체계를 서로 다른 곳에서 처리했다.

도메인은 앱이 알 필요가 없다. 그래서 앱까지 오기 전에 Caddy에서 **301**로 넘겼다.
경로와 쿼리는 `{uri}`로 그대로 붙여 보낸다.

```caddyfile Caddyfile
{$REDIRECT_DOMAINS::8081} {
	redir https://{$DOMAIN:localhost}{uri} permanent
}
```

주소 체계는 앱이 안다. 레거시 주소를 21개 패턴으로 정리해서 `next.config.ts`에 표처럼 적었다.
`permanent: true`를 주면 Next.js는 **308**로 응답한다.

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

## 한글 주소는 두 번 인코딩

`Location` 헤더에는 한글을 그대로 쓸 수 없어서 퍼센트 인코딩한다.
`형사`는 `%ED%98%95%EC%82%AC`가 된다.

그런데 Next.js는 destination의 쿼리를 한 번 디코딩한 뒤에 `Location`에 넣는다.
한 번만 인코딩해 두면 디코딩되면서 한글이 그대로 헤더에 들어가 버린다.

그래서 한글은 미리 두 번 인코딩해 두었다. `%`가 `%25`가 되는 식이다.
한 번 풀리고 나면 정상적인 인코딩 한 겹이 남는다.

## canonical과 sitemap은 같은 함수에서

같은 내용이 여러 주소로 열릴 때가 있다.
업무분야 상세는 `?title=`로도, `?workField=`로도 열린다.

이럴 때 검색엔진에게 대표 주소를 알려 주는 게 canonical이다.
sitemap은 "이 주소들을 수집해 달라"는 목록이다.

둘이 다른 주소를 말하면 검색엔진은 어느 쪽을 믿을지 헷갈린다.
그래서 둘 다 같은 함수에서 주소를 만들게 했다. 따로 만들면 언젠가는 어긋난다.

## 운영 서버에서 확인

![curl로 확인한 옛 도메인 301과 레거시 주소 308 응답](urls-curl.webp "운영 서버 응답: 옛 도메인은 301, 레거시 주소는 308")

이제 어느 옛 주소로 들어와도 공식 주소 하나로 모인다.

크롤러는 본문보다 상태 코드를 먼저 읽는다.
soft 404, 308, noindex 헤더 하나가 검색 결과를 바꾼다.

@@ cache
## 미리 만든 페이지는 늦게 바뀐다

Next.js는 서버에서 받아 온 데이터를 캐시해 둔다.
방문자가 올 때마다 백엔드를 부르지 않고 만들어 둔 결과를 내주니까 빠르다.

대신 언제 다시 만들지는 보통 시간으로 정한다.
그 시간이 지나기 전에는 관리자가 글을 고쳐도 방문자는 예전 페이지를 본다.

법인 소식이나 언론보도는 관리자가 올리고 나서 바로 확인하는 글이었다.
이 지연이 그대로 불편이 됐다.

## 시간 말고 "저장"을 기준으로

캐시를 비우는 기준을 시간에서 사건으로 바꿨다. 관리자가 저장한 순간이다.

Next.js는 데이터를 가져올 때 `fetch`에 `next: { tags: ['news'] }`처럼 태그를 붙일 수 있다.
그리고 `revalidateTag('news')`를 부르면 그 태그가 붙은 캐시만 비운다.
다른 페이지 캐시는 그대로 둔다.

관리자 화면에서 저장이나 삭제가 성공하면 `/api/revalidate`를 부르게 했다.

![관리자 저장부터 방문자가 새 글을 받기까지의 순서](revalidate.svg "저장 버튼부터 방문자 화면까지")

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

## 아무나 부르면 안 된다

`/api/revalidate`는 공개된 주소다.
아무나 부를 수 있으면 캐시를 계속 비워서 백엔드를 두드릴 수 있다.

보통은 Next 서버와 호출하는 쪽이 같은 비밀키를 나눠 가진다.
그런데 여기서 호출하는 쪽은 관리자의 브라우저다. 브라우저에 둔 비밀키는 비밀이 아니다.

그래서 관리자 토큰을 그대로 받아서, 백엔드 관리자 API를 한 번 불러 봤다.
토큰이 유효할 때만 캐시를 비운다. 관리자인지는 원래 그걸 아는 백엔드에게 묻는 셈이다.

## 실패해도 결국은 반영된다

이 호출이 실패할 수도 있다. 네트워크가 끊기거나, 관리자가 저장 직후 창을 닫거나.
그래서 시간 기준도 남겨 뒀다. 소식 · 언론보도는 5분, 구성원 · 업무분야는 1시간이 지나면 다시 만든다.

저장이 빠른 길이고, 시간이 안전망이다.

![운영 응답 헤더의 x-nextjs-cache와 cache-control](cache-header.webp "운영 응답 헤더: Next.js 캐시에서 나간 응답")

정적 페이지의 속도는 그대로 두고, 관리자가 저장한 글은 바로 보인다.

관리자 쪽 편의도 하나 더했다. 유튜브 링크만 넣으면 제목과 게시일이 채워진다.

@@ geo
## 사람은 아는데 기계는 모르는 것

로백스라는 법인, 그 구성원, 구성원이 쓴 글.
사람은 화면을 보면 이 셋의 관계를 바로 안다.

검색엔진과 AI는 그렇지 않다. 화면의 배치를 보고 관계를 짐작해야 한다.
로백스에는 그 관계를 알려 주는 구조화 데이터가 하나도 없었다.

## JSON-LD는 사실을 표로 적어 두는 것

JSON-LD는 페이지 안에 `<script type="application/ld+json">`으로 넣는 데이터다.
schema.org가 정한 단어로 "이건 법률 서비스다", "이 사람은 여기서 일한다"를 적는다.

핵심은 `@id`다.
법인에 `#organization`이라는 id를 한 번 정해 두면, 다른 페이지에서는 그 id만 가리키면 된다.
구성원 페이지의 Person은 `worksFor`로, 소식 페이지의 NewsArticle은 `publisher`로 같은 법인을 가리킨다.
그러면 페이지가 달라도 하나의 그래프로 이어진다.

![로백스 법인을 중심으로 구성원, 업무분야, 소식, 영상, 사이트가 @id로 이어진 그래프](graph.svg "@id로 이어진 로백스 JSON-LD 그래프")

언론보도는 하나 더 신경 썼다.
기사는 다른 매체가 쓴 거고, 로백스 사이트는 그걸 옮겨 실었다.
그래서 작성자는 원 매체로, 게시자는 로백스로 나눠 적었다.

```ts apps/next/src/lib/utils/structuredData.ts
// 이 페이지는 로백스 사이트가 게시한다(publisher). 언론보도면 원 매체는 작성자·출처로 남긴다.
author: article.sourceName
  ? { '@type': 'Organization', name: article.sourceName }
  : organizationRef,
publisher: organizationRef,
```

## 화면에 없는 건 채우지 않는다

원칙은 하나였다. **화면에 없는 정보는 JSON-LD에도 넣지 않는다.**

구조화 데이터는 화면의 내용을 기계가 읽기 쉽게 다시 적은 것이어야 한다.
화면에 없는 값을 채우면 검색엔진 입장에서는 확인할 수 없는 주장이 된다.
AI가 그걸 그대로 인용하면 틀린 사실이 퍼진다.

## AI가 가져갈 문장

AI는 답변을 만들 때 페이지에서 짧고 완결된 문장을 찾아 인용한다.
그래서 업무분야 페이지 맨 앞에 두 문장짜리 요약을 두었다.

그리고 그 글이 언제 쓰였는지를 `<time dateTime>`으로 적었다.
사람에게는 날짜로 보이고, 기계에게는 정확한 시각으로 읽힌다.

## 0종에서 7종으로

![업무분야 페이지 HTML에서 뽑은 JSON-LD 타입 목록](geo-jsonld.webp "형사 업무분야 페이지의 첫 HTML에 들어 있는 JSON-LD 타입")

구조화 데이터 타입이 **0 → 7종**이 됐다.
최상위 타입 기준으로 LegalService, Person, Service, NewsArticle, VideoObject, WebSite, BreadcrumbList다.
주소나 목록 항목 같은 하위 타입은 세지 않았다.

해 보니 GEO는 SEO 위에 "그 페이지가 말하는 사실이 정확한가"가 더해진 일이었다.

@@ bundle
## 받은 JS의 대부분을 쓰지 않았다

Chrome DevTools의 Coverage 탭은 받은 JS 중 실제로 실행된 부분을 보여 준다.
첫 진입에서 재 보니, 받은 JS의 대부분이 그 화면에서 쓰이지 않았다.

들여다보니 관리자 코드였다.
홈페이지에 들어온 방문자가 관리자 화면 코드까지 같이 받고 있었다.

## 번들러는 import를 따라간다

왜 이렇게 되는지는 번들러가 일하는 방식을 보면 나온다.

번들러는 진입 파일에서 시작해서 `import`를 하나씩 따라간다.
그렇게 닿는 파일은 전부 같은 번들에 담는다.
라우터가 관리자 화면을 `import`하고 있으면, 관리자 화면도 방문자가 받는 번들에 들어간다.

이걸 끊는 게 동적 `import()`다.
`import()`를 만난 번들러는 거기서 파일을 따로 떼어 낸다(청크). 그 청크는 실제로 필요할 때 받는다.

![이전에는 한 덩어리였던 번들이 이후 사용자 화면과 관리자 청크로 나뉜 모습](chunks.svg "번들 나누기 전과 후")

React에서는 `React.lazy(() => import('./...'))`로 컴포넌트를 감싸면 된다.
청크를 받는 동안 보여 줄 화면은 `Suspense`가 맡는다.
관리자 라우트를 이렇게 나눠서, 관리자 화면에 들어갈 때만 그 코드를 받게 했다.

## lazy만으로는 다 빠지지 않았다

나눴는데도 관리자 코드가 일부 남아 있었다.
원인은 루트 배럴 파일이었다.

배럴은 여러 모듈을 `index.ts` 하나에서 다시 export하는 파일이다.
쓰는 쪽에서는 `import { A } from '@/...'` 한 줄로 끝나서 편하다.

![사용자 화면이 루트 배럴에서 모듈 하나를 import하자 관리자 모듈까지 딸려 오는 모습](barrel.svg "배럴 하나를 거치면 생기는 일")

문제는 번들러 입장이다.
`A` 하나만 가져와도, 번들러는 배럴이 export하는 다른 모듈을 안 써도 되는지 늘 확신하지는 못한다.
확신하지 못하면 일단 담는다. 그 안에 관리자 코드가 있었다.

그래서 루트 배럴의 export와 import 경로를 정리했다.
사용자 화면이 관리자 모듈로 가는 길 자체를 없앴다.

## 결과

첫 진입 JS **7.2MB → 171KB**

나누는 것보다 "무엇이 무엇을 import하고 있나"를 보는 게 먼저였다.
