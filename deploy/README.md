# 서버 배포

- 서버: Lightsail (Ubuntu 24.04), `/srv/archiev`
- 앞단: 이미 80/443을 쓰는 `more-mlnls`의 Caddy. 우리 컨테이너는 그 도커 네트워크(`more-mlnls_default`)에 붙습니다.
- 비밀값: 서버의 `/srv/archiev/.env`(권한 600)에만 있습니다. 저장소에는 없습니다.

## 자동 배포

`main`에 머지되면 `.github/workflows/deploy.yml`이 바뀐 앱만 vitest, 이미지 빌드, 교체합니다.
헬스 체크에 실패하면 `deploy.sh`가 이전 이미지로 되돌립니다.

GitHub Actions의 키는 `authorized_keys`의 `command=`로 묶여 `deploy.sh`만 실행할 수 있습니다.

| Secret | 값 |
| --- | --- |
| `DEPLOY_HOST` | 서버 IP |
| `DEPLOY_SSH_KEY` | 전용 배포 키 (관리자 키가 아닙니다) |
| `DEPLOY_KNOWN_HOSTS` | 서버 호스트 키 |

수동 배포: Actions → deploy → Run workflow.

## 주의: more-mlnls 배포와의 관계

`more-mlnls`를 배포하면 그 저장소의 `deploy/Caddyfile`이 서버 파일을 덮어써 이 사이트들의 라우트가 사라집니다.
`more-mlnls`를 다시 배포했다면 `deploy/server-setup.sh`를 다시 실행하세요.

## 서버 설정이 바뀌었을 때

`deploy/docker-compose.yml`, `deploy.sh`, `Caddyfile.mlnl`을 고치면 관리자 키로 다시 설치합니다.
전용 배포 키로는 이 파일들을 바꿀 수 없습니다.

```bash
scp -i <pem> deploy/docker-compose.yml deploy/deploy.sh deploy/Caddyfile.mlnl ubuntu@<서버>:/tmp/archiev-setup/
ssh -i <pem> ubuntu@<서버> 'bash -s' < deploy/server-setup.sh
```
