#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PORT="${PORT:-5173}"
HOST="${HOST:-0.0.0.0}"

mkdir -p .pids

echo "MovieFlix Dashboard launcher"
echo "Directory: $APP_DIR"
echo "Host: $HOST"
echo "Port: $PORT"
echo

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP -sTCP:LISTEN -n -P | grep -q ":${PORT}"; then
    echo "Warning: Port ${PORT} is already in use."
    echo "If this is another process, stop it or set PORT=xxxx before running."
    echo
  fi
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting dashboard..."
nohup npm run dev -- --host "${HOST}" --port "${PORT}" > dev.log 2>&1 &
echo $! > .pids/dashboard.pid
echo "Dashboard started (logs: dev.log)"

echo "Starting Telegram bot..."
nohup npm run telegram:bot > telegram-bot.log 2>&1 &
echo $! > .pids/telegram-bot.pid
echo "Telegram bot started (logs: telegram-bot.log)"

echo
echo "Done. Open: http://<server-ip>:${PORT}/emby/"
