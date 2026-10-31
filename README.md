# archiev-mlnls

| 경로 | 주소 | 설명 |
| --- | --- | --- |
| `apps/cv` | [mlnl.site](https://mlnl.site) | 한 페이지 이력 (정적 HTML) |
| `apps/blog` | [blog.mlnl.site](https://blog.mlnl.site) | 마크다운 블로그 (Next.js, JSON-LD 자동 생성, 댓글) |
| `apps/employ` | employ.mlnl.site | 채용 공고 추천과 맞춤 이력서 (관리자 전용) |
| `apps/employ-worker` | Mac에서 실행 | 이력서 요청을 Claude Code로 처리 |
| `apps/api` | `/api/*` | Node.js(Hono) API, SQLite, 매일 8시 수집 |
| `packages/core` | | 프로필, 매칭 엔진 |
| `packages/db` | | SQLite 스키마, 쿼리 (Drizzle) |
| `packages/scraper` | | 채용 사이트 어댑터, 배치 |
| `packages/conventions` | | 커밋, PR, 비밀값 검사 |

## 시작하기

```bash
pnpm install
cp .env.example .env       # 값 채우기 (node scripts/hash-password.mjs '<비밀번호>')
pnpm dev                   # api :4000, blog :3001, employ :3002, cv :3003
pnpm test                  # 전체 vitest
pnpm batch:dry             # DB 저장 없이 수집기 동작 확인
```

## 커밋과 PR 규칙

```
[BLOG/feature] 댓글 삭제 추가
```

- 범위: `BLOG`, `CV`, `EMPLOY`, `API`, `COMMON`
- 종류: `feature`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`, `ci`, `perf`
- 앱 폴더 하나만 고치면 그 앱, 둘 이상이거나 `packages/`, 루트 파일을 고치면 `COMMON`입니다.
- husky가 커밋 때, CI가 PR 제목에서 검사합니다. 키, `.env`, `.pem`은 커밋이 막힙니다.

## CI/CD

- PR: 제목 규칙, 비밀값 검사(gitleaks), 바뀐 패키지와 그 의존 패키지만 typecheck, vitest, build
- main 머지: 바뀐 앱만 이미지 빌드 후 교체, 실패하면 이전 이미지로 복구 ([deploy/README.md](deploy/README.md))

## 맞춤 이력서가 만들어지는 과정

서버에 Anthropic API 키를 두지 않습니다.

1. 공고 화면에서 버튼을 누르면 API가 큐(`resume_jobs`)에 넣습니다.
2. Mac의 워커가 나가는 HTTPS로 폴링해 작업을 가져갑니다 (서버가 Mac으로 들어오지 않습니다).
3. `claude -p`가 프로필과 JD로 이력서 JSON을 씁니다. 공고는 신뢰할 수 없는 입력이라 이 단계에서는 도구를 전부 끕니다.
4. `claude -p`가 Figma MCP로 프레임을 그립니다. 이 단계에서는 피그마와 스킬 도구만 허용합니다.
5. 결과가 이력서 페이지에 표시됩니다. 피그마가 실패해도 내용은 남습니다.

연락처와 병역 정보는 Claude로 보내지 않습니다.

```bash
mkdir -p ~/.archiev && printf 'WORKER_TOKEN=...\nFIGMA_FILE_KEY=...\n' > ~/.archiev/worker.env
pnpm worker              # 직접 실행
pnpm worker:install      # 로그인 시 자동 실행 (launchd)
```

## 수집 소스

원티드, 점핏, 사람인, 잡코리아, 자소설닷컴, 토스, 네이버, 라인, KT, Greenhouse 기반 기업(쿠팡, 당근, 크래프톤 등)을
개인 용도로 하루 한 번 적은 페이지만 조회합니다.

잡플래닛은 Cloudflare가 서버 요청을 차단해서, 카카오와 우아한형제들은 약관과 robots.txt 때문에 수집하지 않습니다. 차단은 우회하지 않습니다.
