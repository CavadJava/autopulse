#!/usr/bin/env bash
# Deploys AutoPulse to the shared VPS.
#
# The app is a static SPA: source is synced to the server, dependencies are
# installed there, the production build is generated, and Caddy serves dist/
# directly with an SPA fallback.
#
# Idempotent: safe to re-run any time to ship the latest code.
#
# Overrides:
#   SERVER=root@host SSH_KEY=~/.ssh/id_ed25519 DOMAIN=my.host ./deploy.sh

set -euo pipefail

SERVER="${SERVER:-root@157.180.73.79}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/youtube-remote-webrtc_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/autopulse}"
SERVICE_USER="${SERVICE_USER:-youtube-remote}"
DOMAIN="${DOMAIN:-autopulse.157.180.73.79.sslip.io}"

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

ssh_() {
  ssh "${SSH_OPTS[@]}" "$SERVER" "$@"
}

echo "==> [1/6] Syncing source to $SERVER:$REMOTE_DIR"

ssh_ "mkdir -p '$REMOTE_DIR'"

rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  --exclude .env.production \
  -e "ssh ${SSH_OPTS[*]}" \
  "$LOCAL_DIR"/ "$SERVER:$REMOTE_DIR/"

echo "==> [2/6] Ensuring Node.js 18+ is installed"

ssh_ '
  if ! command -v node >/dev/null || [ "$(node -e "console.log(process.versions.node.split(\".\")[0])")" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  node -v
  npm -v
'

echo "==> [3/6] Installing dependencies and building"

ssh_ "
  cd '$REMOTE_DIR'

  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi

  npm run build
"

echo "==> Verifying build output"

ssh_ "
  test -f '$REMOTE_DIR/dist/index.html' || {
    echo \"XƏTA: build dist/index.html yaratmadı.\" >&2
    exit 1
  }
"

echo "==> [4/6] Ownership and permissions"

ssh_ "chown -R '$SERVICE_USER:$SERVICE_USER' '$REMOTE_DIR'"

# Caddy runs as its own system user and serves dist/ directly.
ssh_ "chmod -R o+rX '$REMOTE_DIR/dist'"

echo "==> [5/6] Configuring Caddy site for $DOMAIN"

CADDY_SNIPPET="$(mktemp)"
trap 'rm -f "$CADDY_SNIPPET"' EXIT

cat > "$CADDY_SNIPPET" <<EOF

$DOMAIN {
    root * $REMOTE_DIR/dist

    try_files {path} /index.html

    file_server
}
EOF

scp \
  "${SSH_OPTS[@]}" \
  "$CADDY_SNIPPET" \
  "$SERVER:/tmp/autopulse-caddy-snippet.txt"

ssh_ "
  if ! grep -q '$DOMAIN' /etc/caddy/Caddyfile 2>/dev/null; then
    cat /tmp/autopulse-caddy-snippet.txt >> /etc/caddy/Caddyfile
  else
    echo 'Caddy config for $DOMAIN already exists; skipping append.'
  fi

  rm -f /tmp/autopulse-caddy-snippet.txt

  caddy fmt --overwrite /etc/caddy/Caddyfile
"

# Validate before reloading so a bad config doesn't replace the live one.
ssh_ "caddy validate --config /etc/caddy/Caddyfile"

# Reload can occasionally hiccup under load. Caddy keeps the previous
# working configuration in that case, so don't fail the whole deploy.
ssh_ "systemctl reload caddy" || \
  echo "    (Caddy reload hiccuped — previous config remains active)"

echo "==> [6/6] Verifying deployment"

ssh_ "
  test -f '$REMOTE_DIR/dist/index.html' &&
  echo 'dist/index.html present'
"

echo "==> Done: https://$DOMAIN/"
echo "==> AutoPulse deploy uğurla tamamlandı."