@@ electron
## 데스크톱은 매번 손으로

사내 CLI의 `bc init`은 웹 프로젝트(React · Next)만 만들 수 있었다.
데스크톱 앱 요청이 들어오면 Electron 프로젝트는 매번 손으로 세팅했다.

## Desktop 선택지 추가

`bc init`에 Desktop(Electron)을 더했다.

![bc init에서 React, Next.js, Mobile(Expo), Desktop(Electron) 중 하나를 고르는 화면](cli-init.webp "bc init 실행 화면")

Desktop을 고르면 이런 프로젝트가 만들어진다.

- electron-vite로 main · preload · renderer를 나눈다
- renderer는 웹 프로젝트와 같은 폴더 구조, 디자인 토큰, API 레이어를 쓴다
- electron-builder로 macOS · Windows 설치 파일을 만든다

보안 설정은 처음부터 켜 둔다.
renderer는 OS에 직접 닿지 못하고, preload가 `window.api`로 열어 준 기능만 쓴다.

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

## 결과

Desktop을 고르면 웹 프로젝트와 같은 규칙으로 데스크톱 앱이 시작된다.

@@ expo
## 앱도 매번 손으로

앱 프로젝트는 create-expo-app으로 만든 다음, 사내 설정을 매번 손으로 맞췄다.

## create-expo-app 위에 덮어쓰기

`bc init`에서 Mobile(Expo)을 고르면, create-expo-app으로 프로젝트를 만든 뒤 그 위에 사내 설정을 덮어씌운다.

- 앱 이름, 번들 ID, 딥링크 scheme을 물어 `app.config.ts`에 적는다
- EAS에 로그인돼 있으면 `eas init`으로 projectId까지 연결한다
- NativeWind, TanStack Query, axios를 기본으로 갖춘다

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

핵심은 순서다.
만들어지는 workflow에서 release job은 deploy job 뒤에 묶여 있다. 배포가 성공해야만 태그 · Release · Slack 알림이 이어진다.

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

CHANGELOG.md 선택지는 일부러 막았다. 머지할 때 쓰는 CHANGELOG는 실패한 배포까지 기록하기 때문이다.
Slack 웹훅은 URL 대신 GitHub Secret 이름만 저장한다.

## 결과

최신 Release가 곧 지금 운영 버전이다.

배포 기록은 "배포 성공"에 묶어야 믿을 수 있다.

@@ release-notes
## 노트 쓰는 방식도 제각각

릴리즈 노트를 남기는 프로젝트도 쓰는 방식이 서로 달랐다.

## 커밋에서 노트 만들기

공통 settings 패키지에 `byuckchon-release-notes` 명령을 더했다.

- 이전 태그 이후 커밋을 ✨ 기능 · 🐛 수정으로 묶어 노트를 쓴다
- 태그는 날짜 버전으로 붙인다. `web@2026.11.05`, 같은 날 다시 배포하면 `.2`
- 커밋을 나누는 코드는 PR 본문을 자동으로 쓰는 명령과 같은 것을 쓴다

PR 본문 쪽에서 이미 쓰고 있던 형식은 이렇다. 릴리즈 노트도 같은 분류로 나온다.

```markdown PR 본문 예시
### ✨ 기능

- **settings** — tsconfig 프리셋 추가 (a1b2c3d)

### 🐛 수정

- letterSpacing % → em 변환 (b2c3d4e)
```

## 결과

어느 프로젝트든 같은 형식의 릴리즈 노트가 남는다.

@@ v3
## 아무도 쓰지 않는 기능

`bc init`을 할 때마다 묻는 질문들이 있었고, 채팅 기능도 있었다. 둘 다 쓰이지 않았다.

그리고 오래된 설치본으로 만든 프로젝트는 템플릿이 어긋났다.
같은 CLI로 만들었는데 프로젝트마다 구조가 조금씩 달랐다.

## 걷어내고, 막기

채팅과 생성 질문을 걷어내고 v3.0.0으로 정리했다.

그리고 실행할 때 npm 최신 버전과 비교하게 했다.
버전이 다르면 업데이트를 안내하고 실행을 멈춘다.

## 결과

**5,923줄**과 의존성 **9개**를 지웠다.
이제 모든 프로젝트가 같은 버전의 CLI로 만들어진다.

@@ qa
## 하나씩 보고되던 버그

사내 서비스들이 함께 쓰는 core · basic-ui · utils · hooks 패키지에서 버그가 하나씩 보고되고 있었다.
모아서 한 번에 고쳤다. (MOD-21 ~ 35)

## 고친 것들

- 1월 31일에서 다음 달로 넘기면 3월이 되던 달력
- KST에서 달이 하나 밀리던 문제
- SSR에서 `SanitizeHtml`이 터지던 문제
- 이메일 · 생년월일 · 주민번호 정규식 오류

## 결과

결함 12건을 고쳐 changeset으로 배포했다.

## 배포하려는데 CI가 깨졌다

Release CI가 실패했다.
npm 11로 만든 lockfile이 Node 20의 `npm ci`에서 깨진 것이었다.

npm 10으로 lockfile을 다시 만들어 두 버전 모두에서 통과시켰다.
