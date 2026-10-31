#!/usr/bin/env bash
# 서버 최초 설치 (로컬에서 관리자 SSH로 실행). 여러 번 실행해도 안전합니다.
#   ssh ubuntu@서버 'bash -s' < deploy/server-setup.sh
# 앞서 /tmp/archiev-setup 에 docker-compose.yml, deploy.sh, Caddyfile.mlnl 을 올려 둡니다.
# 기존 more-mlnls 컨테이너는 건드리지 않습니다. Caddyfile에는 우리 블록만 추가합니다.
set -euo pipefail

DIR=/srv/archiev
SRC=/tmp/archiev-setup
CADDY=more-mlnls-caddy-1
CADDYFILE=/srv/more-mlnls/deploy/Caddyfile

sudo mkdir -p "$DIR"
sudo chown "$(id -u):$(id -g)" "$DIR"
install -m 644 "$SRC/docker-compose.yml" "$DIR/docker-compose.yml"
install -m 755 "$SRC/deploy.sh" "$DIR/deploy.sh"
install -m 644 "$SRC/Caddyfile.mlnl" "$DIR/Caddyfile.mlnl"
touch "$DIR/images.env"
[ -f "$DIR/.env" ] || { echo "$DIR/.env 가 없습니다" >&2; exit 1; }
chmod 600 "$DIR/.env"

# Caddy 라우트: 우리 블록만 교체하고, 검증에 실패하면 원래대로 되돌립니다
BACKUP="$DIR/Caddyfile.backup.$(date +%Y%m%d%H%M%S)"
cp "$CADDYFILE" "$BACKUP"
NEXT="$(mktemp)"
sed '/^# >>> archiev-mlnls/,/^# <<< archiev-mlnls/d' "$CADDYFILE" > "$NEXT"
cat "$DIR/Caddyfile.mlnl" >> "$NEXT"
# 단일 파일 바인드 마운트라 inode를 유지해야 컨테이너가 새 내용을 봅니다
cat "$NEXT" > "$CADDYFILE"
rm -f "$NEXT"
if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  cat "$BACKUP" > "$CADDYFILE"
  echo "Caddyfile 검증 실패, 되돌렸습니다" >&2
  exit 1
fi
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "설치 완료"
