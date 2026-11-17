@@ render
## Next.js인데 SSR이 꺼져 있었다

법조인대관은 Next.js로 만든 서비스였다.
그런데 클라이언트 전용 렌더링이 화면 전체를 감싸고 있었다.

Next.js를 쓰고 있었지만 실제로는 SSR이 동작하지 않았다.
서버는 빈 껍데기를 보내고, 화면은 브라우저가 JS를 받아 실행한 뒤에야 그려졌다.

## 필요한 곳만 클라이언트로

클라이언트 렌더링이 꼭 필요한 컴포넌트만 남기고, 나머지는 서버에서 그리게 범위를 좁혔다.

한글 폰트도 손봤다.
dynamic subset으로 바꿔 페이지에 쓰인 글자 묶음만 받게 하고, 캐시를 적용했다.

## 결과

- Lighthouse Performance **80 → 99**
- FCP **−77%**, LCP **−73%**

![한국법조인대관 모바일 메인 화면](render-mobile.webp "운영 화면 (모바일)")

@@ ga4
## 첫 페이지만 기록되고 있었다

법조인대관은 화면 안에서 주소가 바뀌는 SPA 라우팅을 쓴다.
그런데 GA4 page_view는 첫 진입 때만 기록되고, 그 뒤로 화면을 옮겨 다닌 기록은 빠지고 있었다.

사용자가 들어온 뒤 어디로 이동하는지 알 수 없는 데이터였다.

## 라우트가 바뀔 때마다

라우트가 바뀌는 시점에 page_view를 보내도록 추적을 다시 설계했다.
그리고 주요 CTA에는 커스텀 이벤트를 연결해, 페이지뷰만이 아니라 무엇을 눌렀는지도 남게 했다.

## 결과

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

EC2는 VPN IP에서 오는 연결만 받는다. GitHub 러너의 IP는 실행할 때마다 바뀐다.
GitHub에서 서버로 SSH를 걸 수가 없었다.

그래서 질문이 바뀌었다.
"어떻게 자동화하나"가 아니라 "들어갈 수 없는 서버에 어떻게 배포하나".

## 안에서 밖으로 나가는 연결만

방향을 뒤집었다.
베스천에 self-hosted runner를 두면, runner가 GitHub으로 나가는 443 롱 폴링으로 작업을 받아 온다.
서버로 들어오는 연결이 필요 없으니 VPN 규칙은 그대로 둘 수 있었다.

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

빌드는 맥 대신 GitHub 서버에서 amd64로 바로 한다.
버전은 최신 태그와 PR 라벨로 정한다. 이건 [따로 정리했다](/projects/lawtimes/release/).

## 결과

![lawpeople deploy workflow 실행 목록](runner-runs.webp "머지할 때마다 돈 배포 workflow")

이제 main이나 dev에 머지하면 배포된다.
pem 파일, VPN 계정, 비밀번호를 사람끼리 주고받을 일도 없어졌다.

## 하나 걸렸던 것

새 브랜치를 push했는데 workflow가 아무 기록 없이 건너뛰었다.
paths 필터가 비교할 이전 커밋이 없어서 바뀐 파일이 없다고 판단한 것이다.

다음 사람이 같은 데서 헤매지 않게 workflow 맨 위에 적어 두었다.

```yaml .github/workflows/lawpeople-deploy.yml
# 주의: 이미 다른 브랜치로 올라간 커밋으로 브랜치를 '새로 만드는' push 는 바뀐 파일이 없다고 판단돼 돌지 않습니다.
#       그럴 땐 그 브랜치에 새 커밋을 하나 더 올리세요.
```

@@ rolling
## 자동화하면 실패도 자동으로 일어난다

배포를 자동으로 돌리게 되자 다른 걱정이 생겼다.
실패했을 때 무엇을 할지 코드에 적혀 있지 않으면, 기존 컨테이너는 멈춘 채로 배포가 끝난다.

## 지우지 말고 멈춰 두기

운영 서버에는 3000, 3001 두 포트에 컨테이너가 하나씩 떠 있다. 이걸 하나씩 바꾼다.

1. 기존 컨테이너는 지우지 않고 멈춘 뒤 `-old`로 이름을 바꿔 보관한다
2. 새 컨테이너를 띄운다
3. 60초 안에 응답이 오면 `-old`를 지우고 다음 포트로 넘어간다
4. 응답이 없으면 그 포트만 이전 컨테이너로 되돌리고, 다음 포트는 건드리지 않는다

한 번에 하나만 내리니까 나머지 포트는 계속 요청을 받는다.

![헬스체크와 복구 함수가 있는 배포 스크립트](rolling-code.webp "헬스체크와 복구 함수")

## set -e가 복구를 건너뛰었다

`set -e`는 명령 하나가 실패하는 순간 스크립트를 끝낸다.
그런데 그 "끝"에는 복구 단계도 포함돼 있었다. 실패하면 복구 함수까지 가지 못하고, 기존 컨테이너가 멈춘 채로 남았다.

그래서 실패할 수 있는 단계는 `if ! ...; then restore`로 감쌌다.

```bash scripts/deploy-lawpeople.sh
if ! $DOCKER run -d --name "$NAME" --restart unless-stopped -p "${PORT}:${APP_PORT}" "$IMAGE" >/dev/null; then
  log "!!! :${PORT} 컨테이너 실행 실패 — 이 포트는 이전 컨테이너로 복구하고, 다음 포트는 건드리지 않음"
  restore "$NAME" "$OLD"
  exit 1
fi
```

## 결과

![테스트 서버 배포 로그: 05:55:21 교체 시작, 05:55:29 응답 OK](rolling-log.webp "테스트 서버 배포 로그: 교체부터 응답까지 8초")

테스트 서버는 기존 컨테이너를 멈추고 새 컨테이너가 응답하기까지 **약 8초** 걸린다.
운영은 포트를 하나씩 바꾸니 무중단이다.

롤백은 Actions에서 버전만 입력하면 된다. 다시 빌드하지 않고 기존 이미지로 바꾼다.

## 버전은 한 번 쓰면 끝

롤백을 믿으려면 버전 번호가 가리키는 이미지가 바뀌면 안 된다.
버전은 push한 순간 "쓴 것"이다. 같은 번호로 다시 빌드하면, 그 버전으로 돌아간다는 보장이 깨진다.

@@ security
## 베스천은 운영 서버로 가는 문이다

self-hosted runner를 둔 베스천은 운영 서버로 이어지는 자리다.
여기가 뚫리면 운영 서버까지 열린다.

그래서 runner의 권한을 배포에 필요한 만큼만 남기기로 했다.

## 하나씩 좁히기

- sudo 없는 전용 계정으로 runner를 돌린다
- runner는 main · dev workflow만 쓸 수 있다
- 베스천에서 도는 job에는 Secret을 하나도 넘기지 않는다
- runner의 SSH 키는 `authorized_keys`의 `command=`로 묶어, 서버에서 배포 스크립트 하나만 실행된다

마지막 항목은 이렇게 동작한다.
`command=`로 묶인 키로 들어오면 보낸 명령은 실행되지 않고 `SSH_ORIGINAL_COMMAND`로만 넘어온다.
배포 스크립트는 그 값을 꺼내서 이미지 이름과 포트를 정규식으로 검사한다.

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

@@ release
## 버전을 사람이 정하고 있었다

배포할 때마다 버전 번호를 사람이 정했다.
무엇이 바뀌었는지도 사람이 따로 적어야 했다.

## PR 라벨로 버전 정하기

PR에 `release:major`나 `release:minor` 라벨을 붙이면 그 자리를 올리고, 라벨이 없으면 patch를 올린다.
PR 없이 바로 push한 커밋은 항상 patch다.

```bash scripts/lawpeople-version.sh
bump=patch
labels=" $(echo $LABELS) "
if [[ "$labels" == *" release:major "* ]]; then bump=major
elif [[ "$labels" == *" release:minor "* ]]; then bump=minor
fi
```

배포가 끝나면 태그를 붙이고 GitHub Release에 변경 내역을 남긴다.
release job은 운영 서버에 새 버전이 배포됐을 때만 돈다.

## 결과

![lawpeople GitHub Release 목록](release-list.webp "운영 저장소의 Release 목록")

운영 버전과 변경 내역이 Release 목록에 쌓인다.

이 흐름은 나중에 [사내 CLI의 bc deploy](/projects/frontend-tools/deploy/)로 옮겨 다른 프로젝트에서도 쓰게 했다.
