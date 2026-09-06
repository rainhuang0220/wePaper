#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${WEPAPER_SSH:-ubuntu@175.24.134.228}"
REMOTE="${WEPAPER_REMOTE:-/home/ubuntu/wepaper}"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude 'web/node_modules' \
  --exclude '.wepaper' \
  --exclude '__pycache__' \
  "$ROOT/" "$HOST:$REMOTE/"

ssh "$HOST" bash -s -- "$REMOTE" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
cd "$REMOTE_DIR"
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
if [ ! -x .venv/bin/python ]; then
  uv python install 3.12 >/dev/null
fi
uv sync --index-url https://pypi.tuna.tsinghua.edu.cn/simple
sudo mkdir -p /var/lib/wepaper
sudo chown ubuntu:ubuntu /var/lib/wepaper
sudo chmod 700 /var/lib/wepaper
if [ ! -f .env ]; then
  umask 077
  {
    echo 'WEPAPER_DATA_DIR=/var/lib/wepaper'
    echo 'WEPAPER_HOST=127.0.0.1'
    echo 'WEPAPER_PORT=8788'
    echo 'WEPAPER_PUBLIC_URL=https://wepaper.plainlist.space'
    echo "WEPAPER_SYNC_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  } > .env
  echo 'created .env'
else
  grep -v '^WEPAPER_PUBLIC_URL=' .env > .env.tmp || true
  echo 'WEPAPER_PUBLIC_URL=https://wepaper.plainlist.space' >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
fi
sudo cp deploy/wepaper.service /etc/systemd/system/wepaper.service
sudo systemctl daemon-reload
sudo systemctl enable --now wepaper
sudo systemctl restart wepaper
sleep 2
curl -fsS http://127.0.0.1:8788/api/v1/health
echo
set -a
# shellcheck disable=SC1091
source .env
set +a
uv run wepaper linearize
REMOTE

echo "deployed to $HOST:$REMOTE"
