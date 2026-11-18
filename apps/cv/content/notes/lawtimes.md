@@ render
## Next.js인데 화면은 브라우저가 그렸다

법조인대관은 Next.js로 만든 서비스였다.
Next.js를 쓰면 서버가 HTML을 그려서 보내 주는 게 기본이다.

그런데 `_app.tsx`를 열어 보니 앱 전체가 이렇게 감싸여 있었다.

```tsx src/pages/_app.tsx (이전)
<HydrationProvider>
  {/* ... */}
  <Client>
    <ThemeWrapper>
      {/* ... */}
      {getLayout(<Component {...props} />)}
    </ThemeWrapper>
  </Client>
</HydrationProvider>
```

`react-hydration-provider`의 `<Client>`는 브라우저에서 hydration이 끝난 뒤에만 안쪽을 그린다.
서버에서는 아무것도 그리지 않는다.

이게 앱 전체를 감싸고 있으니, 모든 페이지가 서버에서 빈 껍데기로 나갔다.
Next.js를 쓰고 있었지만 실제로는 SSR이 동작하지 않았다.

## 서버가 그리면 왜 빨라지나

브라우저가 화면에 처음 뭔가를 그리는 순간을 FCP, 가장 큰 덩어리를 그리는 순간을 LCP라고 한다.
Lighthouse 성능 점수는 이 시간들로 매긴다.

![이전에는 JS를 받아 실행한 뒤에야 첫 화면, 이후에는 HTML을 받자마자 첫 화면](hydration.svg "첫 화면이 그려지는 시점")

서버가 빈 껍데기를 보내면 브라우저는 JS를 다 받고 실행할 때까지 그릴 게 없다.
서버가 화면을 그려 보내면 HTML을 받는 순간 이미 화면이 있다.
JS는 그 뒤에 와서 버튼 같은 동작만 붙인다.

## 걷어내자 터진 곳

`<Client>`를 걷어내고, 클라이언트 렌더링이 꼭 필요한 컴포넌트만 따로 남겼다.

그러자 숨어 있던 문제가 드러났다.
검색 영역 세 곳이 처음 상태를 `window.location`으로 정하고 있었다.

```tsx SearchWrap.tsx
// 이전: 서버에는 window가 없어서 여기서 터진다
const [isSearch, setIsSearch] = useState<boolean>(LINKS.SEARCH === window.location.pathname);

// 이후: 서버와 브라우저 양쪽에 있는 router 값으로
const router = useRouter();
const [isSearch, setIsSearch] = useState<boolean>(LINKS.SEARCH === router.pathname);
```

`window`는 브라우저에만 있다.
`<Client>`가 감싸고 있을 때는 이 코드가 서버에서 돈 적이 없어서 몰랐던 것이다.

## 폰트도 첫 화면을 붙잡고 있었다

글자가 화면에 나오려면 폰트가 필요하다.
그런데 브라우저는 HTML을 읽고, CSS를 받고, 그 안의 `@font-face`를 읽은 뒤에야 폰트를 받으러 간다.

게다가 폰트는 다른 도메인(사내 이미지 서버)에 있었다.
다른 도메인이면 연결을 새로 맺는 시간이 더 든다.

![폰트가 CSS 뒤에 다른 도메인에서 늦게 받아지던 것이, preload로 HTML과 같이 받아지게 바뀐 모습](font.svg "폰트를 받기 시작하는 시점")

그래서 네 가지를 바꿨다.

1. 폰트를 같은 도메인의 `/fonts`로 옮겼다
2. 자주 쓰는 굵기 두 개는 `<link rel="preload">`로 HTML을 읽자마자 받게 했다
3. `font-display: swap`으로, 폰트가 오기 전에도 기본 글꼴로 글자를 먼저 보여 주게 했다
4. 폰트 파일은 이름이 바뀌지 않으니 1년 동안 다시 받지 않게 캐시를 걸었다

```js next.config.js
async headers() {
  return [
    {
      source: '/fonts/:font*',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ];
},
```

## 점수로 확인

- Lighthouse Performance **80 → 99**
- FCP **−77%**, LCP **−73%**

![한국법조인대관 모바일 메인 화면](render-mobile.webp "운영 화면 (모바일)")

@@ ga4
## 첫 페이지만 기록되고 있었다

법조인대관은 SPA처럼 화면 안에서 주소가 바뀐다.
그런데 GA4에는 첫 진입 page_view만 쌓이고, 그 뒤로 화면을 옮겨 다닌 기록은 빠지고 있었다.

사용자가 들어온 뒤 어디로 이동하는지 알 수 없는 데이터였다.

## 문서는 한 번만 받는다

원인은 SPA가 화면을 바꾸는 방식에 있다.

일반 웹사이트는 링크를 누르면 문서를 새로 받는다.
문서를 받을 때마다 분석 스크립트도 다시 돌고, page_view가 한 번씩 쌓인다.

SPA는 문서를 처음에 한 번만 받는다.
그 뒤에는 `history.pushState`로 주소만 바꾸고 화면은 JS가 다시 그린다.
문서가 그대로니까 "문서를 받을 때 한 번" 도는 코드는 다시 돌지 않는다.

![문서 한 장 안에서 pushState로 주소만 바뀌고, 이전에는 첫 진입만 page_view가 남던 모습](spa-pageview.svg "SPA에서 page_view가 빠지던 자리")

## 라우트가 바뀔 때마다 직접

그래서 화면 이동이 끝나는 시점에 직접 page_view를 보내게 했다.
Next.js 라우터는 이동이 끝나면 `routeChangeComplete`를, 해시만 바뀌면 `hashChangeComplete`를 알려 준다.

```tsx src/pages/_app.tsx
// GA 4 EVENT
useEffect(() => {
  const handleRouteChange = (url: URL) => {
    gtag.pageview(url);
  };
  router.events.on('routeChangeComplete', handleRouteChange);
  router.events.on('hashChangeComplete', handleRouteChange);
  return () => {
    router.events.off('routeChangeComplete', handleRouteChange);
    router.events.off('hashChangeComplete', handleRouteChange);
  };
}, [router]);
```

페이지뷰만으로는 "어디를 봤는지"까지만 안다.
주요 CTA에는 커스텀 이벤트를 연결해서 "무엇을 눌렀는지"도 남게 했다.

```ts src/lib/gtag.ts
export const event = ({ action, category, label, value }: GTagEvent): void => {
  if (typeof window === 'undefined' || typeof window.gtag === 'undefined') return;
  window.gtag('event', action, { event_category: category, event_label: label, value: value });
};
```

## 지금 쌓이는 데이터

한 달에 이벤트 **1,039,503건**, 사용자 **88,231명**의 행동 데이터를 모으고 있다.

@@ runner
## 다섯 단계 손작업

법조인대관 배포는 이랬다.

1. 맥에서 크로스 빌드
2. VPN 접속
3. 베스천에 SSH
4. 컨테이너 하나씩 교체
5. git 싱크

자동화하려고 보니 막히는 곳이 있었다.

## 들어갈 수 없는 서버

EC2는 VPN IP에서 오는 연결만 받는다.
GitHub Actions가 기본으로 쓰는 러너는 실행할 때마다 새로 뜨는 가상 머신이라, IP가 매번 바뀐다.
GitHub에서 서버로 SSH를 걸 수가 없었다.

여기서 방화벽이 연결을 어떻게 보는지가 중요했다.
방화벽이 막는 건 **밖에서 안으로 새로 들어오는 연결**이다.
안에서 밖으로 나간 연결의 응답은 그대로 돌아온다.

그래서 질문을 바꿨다.
"밖에서 어떻게 들어가나"가 아니라 "안에서 어떻게 일을 받아 오나".

## 안에서 밖으로 묻기

베스천에 self-hosted runner를 두었다.
self-hosted runner는 GitHub에 443(HTTPS)으로 계속 "할 일 있어?" 하고 물어보는 프로그램이다.
GitHub이 러너를 부르는 게 아니라, 러너가 GitHub에게 일을 받아 온다.

![이전에는 GitHub에서 EC2로 SSH가 막혔고, 이후에는 베스천의 러너가 GitHub에 443으로 일을 받아 와 EC2에 SSH로 배포하는 구조](runner.svg "연결의 방향을 뒤집었다")

서버로 새로 들어오는 연결이 없으니 VPN 규칙은 하나도 바꾸지 않았다.
베스천에서 운영 서버로 가는 SSH는 원래 사람이 쓰던 길이다.

```yaml .github/workflows/lawpeople-deploy.yml
deploy:
  needs: [meta, build]
  runs-on: [self-hosted, bastion]          # 베스천의 러너 — VPN 불필요
  # 베스천은 메모리가 작아서(454MB) checkout 같은 Node 액션은 쓰지 않고 ssh 한 줄만 실행합니다.
  steps:
    - name: 베스천 → 서버 SSH 후 롤링 교체
      run: |
        ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" "bin/deploy-lawpeople.sh $IMAGE_REF $PORTS"
```

빌드는 맥 대신 GitHub 서버에서 한다.
Apple Silicon 맥은 arm64라서 amd64 서버용 이미지를 만들려면 에뮬레이션을 거쳐야 했다.
GitHub의 리눅스 러너는 처음부터 amd64다.

버전은 최신 태그와 PR 라벨로 정한다. 이건 [따로 정리했다](/projects/lawtimes/release/).

![lawpeople deploy workflow 실행 목록](runner-runs.webp "머지할 때마다 돈 배포 workflow")

이제 main이나 dev에 머지하면 배포된다.
pem 파일, VPN 계정, 비밀번호를 사람끼리 주고받을 일도 없어졌다.

## 하나 걸렸던 것

새 브랜치를 push했는데 workflow가 아무 기록 없이 건너뛰었다.

`paths` 필터는 "이번 push에서 바뀐 파일"을 보고 돌지 말지 정한다.
그런데 이미 다른 브랜치에 있는 커밋으로 브랜치만 새로 만들면, 비교할 이전 커밋이 없어서 바뀐 파일이 없다고 판단한다.

다음 사람이 같은 데서 헤매지 않게 workflow 맨 위에 적어 두었다.

```yaml .github/workflows/lawpeople-deploy.yml
# 주의: 이미 다른 브랜치로 올라간 커밋으로 브랜치를 '새로 만드는' push 는 바뀐 파일이 없다고 판단돼 돌지 않습니다.
#       그럴 땐 그 브랜치에 새 커밋을 하나 더 올리세요.
```

@@ rolling
## 자동화하면 실패도 자동으로 일어난다

사람이 배포할 때는 뭔가 잘못되면 사람이 그 자리에서 수습한다.
자동화하면 그 사람이 없다.

실패했을 때 무엇을 할지 코드에 적혀 있지 않으면, 기존 컨테이너는 멈춘 채로 배포가 끝난다.

## 한 번에 한 포트만

운영 서버에는 3000, 3001 두 포트에 컨테이너가 하나씩 떠 있다.
이걸 한꺼번에 바꾸지 않고 하나씩 바꾼다. 롤링 배포다.

![기존 컨테이너를 멈춰 보관하고 새 컨테이너를 띄운 뒤 응답을 확인해 성공이면 다음 포트로, 실패면 그 포트만 복구하는 흐름](rolling.svg "포트 하나를 바꾸는 순서")

여기서 중요한 건 기존 컨테이너를 **지우지 않는다**는 점이다.
멈추고 `-old`로 이름만 바꿔 둔다. 새 컨테이너가 60초 안에 응답하지 않으면 그걸 다시 띄우면 된다.

그리고 실패하면 다음 포트는 건드리지 않는다.
한 포트가 실패해도 다른 포트는 기존 버전으로 계속 요청을 받는다.

![헬스체크와 복구 함수가 있는 배포 스크립트](rolling-code.webp "헬스체크와 복구 함수")

## set -e가 복구를 건너뛰었다

쉘 스크립트 맨 위의 `set -e`는 명령 하나가 실패하는 순간 스크립트를 끝낸다.
보통은 이게 안전장치다. 실패한 채로 다음 단계를 진행하지 않게 해 준다.

그런데 그 "끝"에는 복구 단계도 포함돼 있었다.
`docker run`이 실패하면 그 자리에서 스크립트가 끝나서, 복구 함수까지 가지 못했다.
기존 컨테이너는 멈춘 채로 남았다.

`set -e`에는 예외가 있다.
`if` 조건 자리에 있는 명령은 실패해도 스크립트를 끝내지 않는다. 그 실패를 직접 처리하겠다는 뜻이기 때문이다.

그래서 실패할 수 있는 단계는 `if ! ...; then restore`로 감쌌다.

```bash scripts/deploy-lawpeople.sh
if ! $DOCKER run -d --name "$NAME" --restart unless-stopped -p "${PORT}:${APP_PORT}" "$IMAGE" >/dev/null; then
  log "!!! :${PORT} 컨테이너 실행 실패 — 이 포트는 이전 컨테이너로 복구하고, 다음 포트는 건드리지 않음"
  restore "$NAME" "$OLD"
  exit 1
fi
```

## 실제로 걸리는 시간

![테스트 서버 배포 로그: 05:55:21 교체 시작, 05:55:29 응답 OK](rolling-log.webp "테스트 서버 배포 로그: 교체부터 응답까지 8초")

테스트 서버는 기존 컨테이너를 멈추고 새 컨테이너가 응답하기까지 **약 8초** 걸린다.
운영은 포트를 하나씩 바꾸니 무중단이다.

## 롤백은 다시 빌드하지 않는다

롤백은 Actions에서 버전만 입력하면 된다.
새로 빌드하지 않고, 그 버전의 기존 이미지로 같은 롤링 교체를 한다.

이게 되려면 버전 번호가 가리키는 이미지가 절대 바뀌면 안 된다.
같은 번호로 다시 빌드해서 덮어쓰면, "그 버전으로 돌아간다"는 말이 거짓이 된다.
그래서 버전은 push한 순간 "쓴 것"으로 보고 다시 쓰지 않는다.

@@ security
## 베스천은 운영 서버로 가는 문이다

self-hosted runner를 둔 베스천은 운영 서버로 이어지는 자리다.
여기가 뚫리면 운영 서버까지 열린다.

그래서 질문을 이렇게 잡았다.
"각 단계가 뚫렸을 때, 공격자가 할 수 있는 일이 무엇인가."
그 답이 "배포 하나"보다 커지지 않게 권한을 한 겹씩 좁혔다.

![workflow, 러너 계정, SSH 키, 배포 스크립트 네 겹과 각 겹이 뚫렸을 때 할 수 있는 일](trust.svg "한 겹씩 좁힌 배포 권한")

## 네 겹

- **workflow**: 러너는 main · dev workflow만 쓸 수 있다. 아무 브랜치에서나 러너에 코드를 올려 돌릴 수 없다
- **러너 계정**: sudo 없는 전용 계정으로 돌린다. 베스천에서 도는 job에는 Secret을 하나도 넘기지 않는다
- **SSH 키**: 러너의 키는 `authorized_keys`의 `command=`로 묶었다
- **배포 스크립트**: 받은 이미지 이름과 포트를 정규식으로 검사한다

## command=는 어떻게 막나

`authorized_keys`에서 키 앞에 `command="..."`를 붙이면, 그 키로 들어온 사람은 무슨 명령을 보내든 적힌 명령만 실행된다.
보낸 명령은 실행되지 않고 `SSH_ORIGINAL_COMMAND` 환경 변수로만 넘어온다.

그래서 키가 새어 나가도 할 수 있는 건 배포 스크립트를 돌리는 것뿐이다.
스크립트는 그 값을 꺼내서, 정해진 형식이 아니면 바로 끝낸다.

```bash scripts/deploy-lawpeople.sh
# authorized_keys 의 command= 로 실행되면 인자가 SSH_ORIGINAL_COMMAND 로 들어옴 (첫 단어는 스크립트 경로)
if [ "$#" -eq 0 ] && [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  read -r -a _args <<<"$SSH_ORIGINAL_COMMAND"
  set -- "${_args[@]:1}"
fi

IMAGE="${1:-}"
if ! [[ "$IMAGE" =~ ^lawtimes/lawtimes-lawman-front:v[0-9]+\.[0-9]+\.[0-9]+(-test(\.[0-9]+)?)?$ ]]; then
  echo "이미지 형식이 아닙니다: '${IMAGE}'" >&2
  exit 2
fi
```

## 결과

사람이 서버에 들어가지 않고, 레포 권한만으로 배포된다.
배포에 필요한 권한은 딱 배포만큼이다.

@@ release
## 버전을 사람이 정하고 있었다

배포할 때마다 버전 번호를 사람이 정했다.
무엇이 바뀌었는지도 사람이 따로 적어야 했다.

사람이 정하면 빠뜨린다. 그리고 같은 번호를 두 번 쓰기도 한다.

## 버전 번호가 뜻하는 것

버전은 `주.부.수` 세 자리로 쓴다.

- **major**: 크게 바뀌어서 이전과 다르게 써야 할 때
- **minor**: 기능이 늘었을 때
- **patch**: 고치기만 했을 때

어느 자리를 올릴지는 "무엇이 바뀌었나"로 정해진다.
그리고 무엇이 바뀌었는지는 PR을 올린 사람이 제일 잘 안다.

## PR 라벨로 정하기

그래서 PR 라벨로 정하게 했다.
`release:major`나 `release:minor` 라벨을 붙이면 그 자리를 올리고, 라벨이 없으면 patch를 올린다.
PR 없이 바로 push한 커밋은 항상 patch다.

| 지금 버전 | 라벨 | 다음 버전 |
|---|---|---|
| v1.4.2 | `release:major` | v2.0.0 |
| v1.4.2 | `release:minor` | v1.5.0 |
| v1.4.2 | 없음 | v1.4.3 |

```bash scripts/lawpeople-version.sh
bump=patch
labels=" $(echo $LABELS) "
if [[ "$labels" == *" release:major "* ]]; then bump=major
elif [[ "$labels" == *" release:minor "* ]]; then bump=minor
fi
```

## 배포가 성공해야 태그가 남는다

![PR 라벨에서 버전 계산, 빌드와 배포를 거쳐 성공했을 때만 태그와 Release가 남는 흐름](version.svg "버전이 정해지고 기록되기까지")

태그와 GitHub Release는 운영 서버에 새 버전이 배포됐을 때만 남긴다.
그래야 "최신 Release = 지금 운영 버전"이 항상 맞다.

![lawpeople GitHub Release 목록](release-list.webp "운영 저장소의 Release 목록")

운영 버전과 변경 내역이 Release 목록에 쌓인다.

이 흐름은 나중에 [사내 CLI의 bc deploy](/projects/frontend-tools/deploy/)로 옮겨 다른 프로젝트에서도 쓰게 했다.
