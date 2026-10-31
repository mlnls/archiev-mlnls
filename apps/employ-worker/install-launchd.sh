#!/usr/bin/env bash
# 로그인할 때 워커가 자동으로 뜨도록 launchd에 등록합니다. 다시 실행하면 경로를 갱신합니다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LABEL="site.mlnl.employ-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ENV_FILE="$HOME/.archiev/worker.env"
PNPM_BIN="$(command -v pnpm)"
CLAUDE_BIN="$(command -v claude)"

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE 이 없습니다. WORKER_TOKEN을 넣어 주세요." >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.archiev"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>ProgramArguments</key>
  <array><string>$PNPM_BIN</string><string>worker</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$CLAUDE_BIN"):$(dirname "$PNPM_BIN"):/usr/local/bin:/usr/bin:/bin</string>
    <key>CLAUDE_BIN</key><string>$CLAUDE_BIN</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.archiev/worker.log</string>
  <key>StandardErrorPath</key><string>$HOME/.archiev/worker.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "등록했습니다. 로그: $HOME/.archiev/worker.log"
