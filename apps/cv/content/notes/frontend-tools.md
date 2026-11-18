@@ electron
## 데스크톱은 매번 손으로

사내 CLI의 `bc init`은 웹 프로젝트(React · Next)만 만들 수 있었다.
데스크톱 앱 요청이 들어오면 Electron 프로젝트는 매번 손으로 세팅했다.

손으로 하면 프로젝트마다 구조가 달라지고, 무엇보다 보안 설정을 빠뜨리기 쉽다.

## Electron은 프로세스가 셋이다

Electron 앱은 크게 세 부분으로 돈다.

- **main**: Node.js 환경이다. 창을 만들고, 파일을 읽고, OS에 닿는다
- **renderer**: 창 안의 웹 화면이다. 크롬 탭과 거의 같다
- **preload**: 둘 사이에 끼는 작은 스크립트다

위험한 건 renderer다.
renderer는 웹 화면이라 외부 콘텐츠나 의존성 코드가 돌 수 있다.
그런데 renderer가 Node.js에 바로 닿으면, 화면에 끼어든 스크립트 하나가 파일을 지우거나 프로그램을 실행할 수 있다.

그래서 renderer는 OS에 직접 닿지 못하게 막고, preload가 열어 준 기능만 쓰게 한다.

![renderer는 preload가 열어 준 window.api로만 main에 요청하고, OS로 직접 가는 길은 막힌 구조](electron.svg "Electron의 세 프로세스와 막아 둔 길")

## Desktop 선택지 추가

`bc init`에 Desktop(Electron)을 더했다.

![bc init에서 React, Next.js, Mobile(Expo), Desktop(Electron) 중 하나를 고르는 화면](cli-init.webp "bc init 실행 화면")

Desktop을 고르면 이런 프로젝트가 만들어진다.

- electron-vite로 main · preload · renderer를 나눈다
- renderer는 웹 프로젝트와 같은 폴더 구조, 디자인 토큰, API 레이어를 쓴다
- electron-builder로 macOS · Windows 설치 파일을 만든다

보안 설정은 처음부터 켜 둔다. 끄면 안 되는 이유도 코드에 같이 적었다.

```js src/generators/createElectronProject.js
webPreferences: {
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  // 보안 기본값 — renderer 는 OS 에 직접 접근하지 못하고 window.api 만 쓴다.
  // 끄지 마세요. 필요한 기능은 preload + ipcMain.handle 로 추가합니다.
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
},
```

- `contextIsolation`: preload와 웹 화면의 JS 공간을 나눈다. 화면 쪽 코드가 preload의 변수를 건드리지 못한다
- `sandbox`: renderer를 크롬의 샌드박스 안에서 돌린다
- `nodeIntegration: false`: renderer에서 `require` 같은 Node.js 기능을 못 쓰게 한다

새 기능이 필요하면 preload에 하나 열고, main의 `ipcMain.handle`에서 처리한다.

## 결과

Desktop을 고르면 웹 프로젝트와 같은 규칙, 같은 보안 기본값으로 데스크톱 앱이 시작된다.

@@ expo
## 앱도 매번 손으로

앱 프로젝트는 create-expo-app으로 만든 다음, 사내 설정을 매번 손으로 맞췄다.
린트, API 레이어, 앱 이름과 번들 ID까지.

## 처음부터 만들지 않고 덮어쓰기

Expo 기본 프로젝트를 직접 흉내 내서 만들지는 않았다.
Expo 쪽 구조는 Expo가 버전마다 바꾼다. 따라 만들면 그때마다 CLI도 고쳐야 한다.

그래서 create-expo-app으로 먼저 만들고, 그 위에 사내 설정만 덮어씌우게 했다.

![create-expo-app으로 만든 뒤 사내 설정을 덮고, app.config.ts를 채우고, 로그인돼 있으면 eas init까지 하는 순서](expo.svg "bc init → Mobile(Expo)")

- 앱 이름, 번들 ID, 딥링크 scheme을 물어 `app.config.ts`에 적는다
- EAS에 로그인돼 있으면 `eas init`으로 projectId까지 연결한다
- NativeWind, TanStack Query, axios를 기본으로 갖춘다

`app.config.ts`는 JSON이 아니라 코드라서, 환경마다 값을 바꿔 끼우기 쉽다.

## 결과

웹과 같은 API 레이어와 린트 설정으로 앱 프로젝트가 시작된다.

@@ deploy
## 지금 운영에 뭐가 떠 있지?

SI 회사라 프로젝트가 계속 새로 생긴다.
배포 방식은 프로젝트마다 제각각이었고, 릴리즈 노트는 손으로 쓰거나 아예 남지 않았다.

그래서 지금 운영에 어떤 버전이 떠 있는지는 물어봐야 알 수 있었다.

## 법조인대관에서 먼저 해 본 것

[법조인대관](/projects/lawtimes/release/)에서는 배포가 끝나면 태그와 Release가 남는 흐름을 먼저 운영하고 있었다.
이걸 모든 프로젝트로 옮기기로 했다.

## bc deploy

`bc deploy`는 질문 4개에 답하면 `.github/workflows/deploy.yml`을 만든다. Enter만 누르면 기본값으로 간다.

![bc deploy: 질문 4개에 답하면 bc.config.json과 배포 workflow가 생성되는 화면](cli-deploy.webp "bc deploy 실행 화면")

## 기록은 성공 뒤에

핵심은 job의 순서다.

GitHub Actions에서 job은 기본으로 동시에 돈다.
`needs`를 주면 그 job이 **성공한 뒤에만** 돈다. 앞 job이 실패하면 건너뛴다.

그래서 release job을 deploy job 뒤에 `needs`로 묶었다.
배포가 성공해야만 태그 · Release · Slack 알림이 이어진다.

![main 머지 후 deploy가 성공하면 release job이 태그, Release, Slack 알림을 남기고, 실패하면 release가 돌지 않는 흐름](jobs.svg "기록은 배포가 성공했을 때만")

```yaml templates/deploy/github/workflows/deploy.yml
# 배포(deploy)가 성공했을 때만 release job 이 돌아 태그와 GitHub Release 를 남깁니다.
jobs:
  deploy:
    # ...
  release:
    needs: deploy # 성공했을 때만
    steps:
      # ...
      - run: gh release create "${{ steps.notes.outputs.tag }}" --target "${{ github.sha }}" --notes-file notes.md
```

CHANGELOG.md 선택지는 일부러 막았다.
머지할 때 쓰는 CHANGELOG는 배포보다 앞에서 남아서, 실패한 배포까지 기록하기 때문이다.

Slack 웹훅은 URL 대신 GitHub Secret 이름만 `bc.config.json`에 저장한다. 레포에 URL이 남지 않게.

## 결과

최신 Release가 곧 지금 운영 버전이다.

배포 기록은 "배포 성공"에 묶어야 믿을 수 있다.

@@ release-notes
## 노트 쓰는 방식도 제각각

릴리즈 노트를 남기는 프로젝트도 쓰는 방식이 서로 달랐다.
누구는 커밋을 그대로 붙이고, 누구는 요약을 손으로 썼다.

## 커밋이 곧 재료

변경 내역은 이미 커밋에 다 있다.
커밋 메시지를 `feat:`, `fix:`처럼 정해진 머리말로 쓰면, 머리말만 보고 기능과 수정을 나눌 수 있다.

공통 settings 패키지에 `byuckchon-release-notes` 명령을 더했다.

![이전 태그 이후 커밋을 기능과 수정으로 묶고, 날짜 버전 태그를 붙이는 흐름](notes.svg "커밋에서 노트와 태그까지")

- 이전 태그 이후 커밋을 ✨ 기능 · 🐛 수정으로 묶어 노트를 쓴다
- 커밋을 나누는 코드는 PR 본문을 자동으로 쓰는 명령과 같은 것을 쓴다

PR 본문 쪽에서 이미 쓰고 있던 형식은 이렇다. 릴리즈 노트도 같은 분류로 나온다.

```markdown PR 본문 예시
### ✨ 기능

- **settings** — tsconfig 프리셋 추가 (a1b2c3d)

### 🐛 수정

- letterSpacing % → em 변환 (b2c3d4e)
```

## 버전은 날짜로

태그는 `web@2026.11.05`처럼 날짜로 붙인다. 같은 날 다시 배포하면 `.2`가 붙는다.

라이브러리는 버전 숫자가 "호환되는가"를 알려 줘야 해서 `주.부.수`가 맞다.
그런데 클라이언트 웹사이트는 다른 코드가 가져다 쓰는 물건이 아니다.
이런 프로젝트에서 사람들이 궁금한 건 "언제 나간 버전이냐"다. 그래서 날짜가 더 잘 읽힌다.

## 결과

어느 프로젝트든 같은 형식의 릴리즈 노트가 남는다.

@@ v3
## 같은 CLI로 만들었는데 구조가 달랐다

오래된 설치본으로 만든 프로젝트는 템플릿이 어긋났다.
같은 CLI로 만들었는데 프로젝트마다 구조가 조금씩 달랐다.

## 왜 어긋나나

원인을 따라가 보니 CLI가 버전표를 어디서 읽는지에 있었다.

CLI는 "어떤 의존성을 몇 버전으로 깔지"를 적은 버전표를, 자기와 같이 설치된 settings 패키지에서 읽는다.
CLI를 예전에 전역으로 깔았으면 버전표도 그때 것으로 굳어 있다.

그런데 생성된 `package.json`에는 settings가 `^` 범위로 들어간다.
그래서 설치할 때는 최신 settings가 깔린다.

![예전에 설치한 CLI의 옛 버전표로 앱 의존성이 들어가고, settings는 ^ 범위라 최신이 깔려 둘이 어긋나는 모습](drift.svg "한 프로젝트 안에서 버전표가 둘")

앱 의존성은 옛 버전표대로, 설정은 새 settings대로.
한 프로젝트 안에 서로 다른 시점의 규칙이 섞였다.

## 최신이 아니면 멈추기

그래서 CLI가 실행될 때 npm에 올라간 최신 버전과 비교하게 했다.
정확히 같지 않으면 업데이트를 안내하고 멈춘다.

![bc 실행 시 npm 최신 버전과 비교해 같으면 생성, 다르면 멈추고, 조회에 실패하면 경고만 하고 진행하는 흐름](guard.svg "bc를 실행하면 먼저 하는 일")

낮을 때만이 아니라 높을 때도 멈춘다.
배포 전 로컬 빌드로 만든 프로젝트도 결국 배포된 템플릿과 다르기 때문이다.

반대로 npm에 접속하지 못하면 경고만 하고 진행한다.
네트워크가 없다고 일을 못 하게 만들 수는 없었다.

## 안 쓰는 건 걷어내기

같이 정리한 게 있다.
`bc init`을 할 때마다 묻는 질문들이 있었고, 채팅 기능도 있었다. 둘 다 쓰이지 않았다.

쓰이지 않는 기능도 의존성을 끌고 오고, 고칠 때마다 같이 신경 써야 한다.
걷어내고 v3.0.0으로 정리했다.

## 결과

**5,923줄**과 의존성 **9개**를 지웠다.
이제 모든 프로젝트가 같은 버전의 CLI로 만들어진다.

@@ qa
## 하나씩 보고되던 버그

사내 서비스들이 함께 쓰는 core · basic-ui · utils · hooks 패키지에서 버그가 하나씩 보고되고 있었다.
모아서 한 번에 고쳤다. (MOD-21 ~ 35)

공통 패키지의 버그는 한 번 고치면 그걸 쓰는 모든 프로젝트가 같이 고쳐진다.
대신 원인을 정확히 모르고 고치면 모든 프로젝트가 같이 깨진다.
그래서 하나씩 "왜 이렇게 됐나"부터 적었다.

## 1월 31일에서 다음 달로 가면 3월

`useMonthCalendar`에서 1월 31일에 다음 달 버튼을 누르면 3월이 나왔다.

JS의 `Date`는 없는 날짜를 만나면 에러를 내지 않고 넘친 만큼 다음 달로 넘긴다.
1월 31일에서 월만 +1 하면 "2월 31일"이 되고, 2월은 28일까지라 3월 3일이 된다.

![이전에는 1월 31일에 월을 더하면 3월 3일이 됐고, 이후에는 1일로 옮긴 뒤 월을 바꾸고 그 달의 마지막 날로 맞춰 2월 28일이 되는 모습](date-overflow.svg "월을 옮기는 순서를 바꿨다")

그래서 순서를 바꿨다.
먼저 1일로 옮긴 다음 월을 바꾸고, 원래 날짜를 그 달의 마지막 날까지로 맞춘다. 시각은 그대로 둔다.

## 한국 시간에서 달이 밀린다

같은 훅에서 처음 날짜의 달이 하나 밀리는 문제도 있었다.

코드가 `getUTCMonth()`로 달을 읽고 있었다.
한국은 UTC보다 9시간 빠르다. 한국 시간 11월 1일 0시는 UTC로 10월 31일 15시다.
그래서 매달 1일 새벽의 날짜를 UTC로 읽으면 전 달이 나온다.

![한국 시간 11월 1일 0시가 UTC로는 10월 31일 15시라 getUTCMonth가 10월을 돌려주는 모습](kst.svg "같은 순간, 다른 달")

달력은 사용자가 보는 날짜를 다룬다. `getFullYear` · `getMonth` 같은 로컬 기준으로 맞추고, 월을 옮길 때도 `setUTCMonth` 대신 `setMonth`를 써서 섞이지 않게 했다.

## 서버에서 터지는 SanitizeHtml

`SanitizeHtml`은 DOMPurify로 HTML에서 위험한 태그를 걸러 낸다.
DOMPurify는 브라우저의 DOM으로 HTML을 해석한다. 그래서 `window`가 필요하다.

그런데 모듈을 불러오는 시점에 `window`로 DOMPurify를 만들고 있었다.
SSR에서는 서버가 이 모듈을 불러오는 순간 `window`가 없어서 터졌다.

- DOMPurify는 호출하는 시점의 `window`로 만들게 바꿨다
- DOM이 없으면 빈 문자열을 돌려준다. 걸러 내지 못한 원본 HTML을 그대로 내보내지 않는다
- 화면용 컴포넌트는 서버와 hydration 첫 렌더에서는 빈 태그를 그리고, 브라우저에서 걸러 낸 결과를 채운다

## 그 밖에

- 이메일 · 생년월일 · 주민번호 정규식 오류
- 페이지 이동 한 번에 `onPageChange`가 두 번 불리던 문제
- 타이머 간격이 1초가 아니면 시간이 빨리 흐르던 문제

결함 12건을 고쳐 changeset으로 배포했다.

## 배포하려는데 CI가 깨졌다

Release CI가 실패했다.
npm 11로 만든 lockfile이 Node 20의 `npm ci`에서 깨진 것이었다.

Node 20에는 npm 10이 같이 들어 있다. lockfile을 만든 npm과 읽는 npm이 달랐다.
npm 10으로 lockfile을 다시 만들어 두 버전 모두에서 통과시켰다.
