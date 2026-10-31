#!/usr/bin/env bash
# /srv/archiev/deploy.sh
# GitHub Actions 전용 키의 authorized_keys command= 로만 실행됩니다.
# 받는 명령: deploy <app> <sha-xxxxxxx> <ghcr-user>, GHCR 토큰은 표준 입력으로 받습니다.
# 새 컨테이너가 60초 안에 healthy가 되지 않으면 이전 이미지로 되돌리고 실패로 끝납니다.
set -euo pipefail

DIR=/srv/archiev
REPO=ghcr.io/mlnls/archiev-mlnls
IMAGES="$DIR/images.env"

read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"
[ "${#ARGS[@]}" -eq 4 ] && [ "${ARGS[0]}" = "deploy" ] || { echo "허용되지 않은 명령입니다" >&2; exit 2; }
APP="${ARGS[1]}"; TAG="${ARGS[2]}"; GHCR_USER="${ARGS[3]}"
[[ "$APP" =~ ^(cv|blog|employ|api)$ ]] || { echo "앱 이름이 잘못되었습니다" >&2; exit 2; }
[[ "$TAG" =~ ^sha-[0-9a-f]{7}$ ]] || { echo "이미지 태그가 잘못되었습니다" >&2; exit 2; }
[[ "$GHCR_USER" =~ ^[A-Za-z0-9-]{1,39}(\[bot\])?$ ]] || { echo "사용자 이름이 잘못되었습니다" >&2; exit 2; }

VAR="$(echo "$APP" | tr '[:lower:]' '[:upper:]')_IMAGE"
SERVICE="mlnl-$APP"
NEW="$REPO/$APP:$TAG"

cd "$DIR"
touch "$IMAGES"
OLD="$(sed -n "s|^$VAR=||p" "$IMAGES")"

# 토큰이 디스크에 남지 않도록 임시 설정을 씁니다
DOCKER_CONFIG="$(mktemp -d)"; export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
docker pull -q "$NEW" >/dev/null

set_image() {
  grep -v "^$VAR=" "$IMAGES" > "$IMAGES.tmp" || true
  [ -n "$1" ] && echo "$VAR=$1" >> "$IMAGES.tmp"
  mv "$IMAGES.tmp" "$IMAGES"
}

compose() { docker compose --env-file "$DIR/.env" --env-file "$IMAGES" -f "$DIR/docker-compose.yml" "$@"; }

wait_healthy() {
  local id status
  for _ in $(seq 1 30); do
    id="$(compose ps -q "$SERVICE")"
    status="$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  return 1
}

set_image "$NEW"
compose up -d --no-deps "$SERVICE"
if wait_healthy; then
  echo "$SERVICE: $NEW"
  docker image prune -f >/dev/null || true
  exit 0
fi

echo "$SERVICE 헬스 체크 실패" >&2
compose logs --tail 40 "$SERVICE" >&2 || true
if [ -n "$OLD" ]; then
  echo "이전 이미지로 되돌립니다: $OLD" >&2
  set_image "$OLD"
  compose up -d --no-deps "$SERVICE"
fi
exit 1
