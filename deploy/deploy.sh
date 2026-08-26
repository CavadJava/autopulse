#!/usr/bin/env bash
# Deploys AutoPulse (frontend + backend) to the shared VPS.
#
# Frontend: a static SPA — source is synced to the server, dependencies are
# installed there, the production build is generated, and Caddy serves dist/
# directly with an SPA fallback.
#
# Backend: a Go service (avtopulse-backend) — source is synced to the server,
# the binary is cross-compiled locally (linux/amd64) since the server has no
# Go toolchain, the new binary + migrations are shipped over, and the
# systemd service is restarted. The service's own startup migration runner
# applies any new migration files.
#
# Idempotent: safe to re-run any time to ship the latest code.
#
# Overrides:
#   SERVER=root@host SSH_KEY=~/.ssh/id_ed25519 DOMAIN=my.host ./deploy.sh
#   SKIP_BACKEND=1 ./deploy.sh   — frontend-only deploy
#   SKIP_FRONTEND=1 ./deploy.sh  — backend-only deploy

set -euo pipefail

SERVER="${SERVER:-root@157.180.73.79}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/youtube-remote-webrtc_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/autopulse}"
BACKEND_REMOTE_DIR="${BACKEND_REMOTE_DIR:-/opt/avtopulse-backend}"
BACKEND_SERVICE_USER="${BACKEND_SERVICE_USER:-youtube-remote}"
BACKEND_SERVICE_NAME="${BACKEND_SERVICE_NAME:-avtopulse-backend}"
SERVICE_USER="${SERVICE_USER:-youtube-remote}"
DOMAIN="${DOMAIN:-autopulse.157.180.73.79.sslip.io}"
SKIP_BACKEND="${SKIP_BACKEND:-}"
SKIP_FRONTEND="${SKIP_FRONTEND:-}"

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_LOCAL_DIR="$LOCAL_DIR/avtopulse-backend"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

ssh_() {
  ssh "${SSH_OPTS[@]}" "$SERVER" "$@"
}

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

if [ -z "$SKIP_BACKEND" ]; then
  echo "==> [Backend 1/5] Cross-compiling avtopulse-backend for linux/amd64"

  BACKEND_BINARY="$(mktemp)"
  trap 'rm -f "$BACKEND_BINARY"' EXIT

  (
    cd "$BACKEND_LOCAL_DIR"
    GOOS=linux GOARCH=amd64 go build -o "$BACKEND_BINARY" ./cmd/server
  )

  echo "==> [Backend 2/5] Syncing backend source (for reference) and migrations"

  ssh_ "mkdir -p '$BACKEND_REMOTE_DIR/migrations'"

  rsync -az \
    --exclude .git \
    --exclude '*.env' \
    -e "ssh ${SSH_OPTS[*]}" \
    "$BACKEND_LOCAL_DIR"/internal/ "$SERVER:$BACKEND_REMOTE_DIR/internal/"

  rsync -az \
    -e "ssh ${SSH_OPTS[*]}" \
    "$BACKEND_LOCAL_DIR"/cmd/ "$SERVER:$BACKEND_REMOTE_DIR/cmd/"

  rsync -az \
    -e "ssh ${SSH_OPTS[*]}" \
    "$BACKEND_LOCAL_DIR"/go.mod "$BACKEND_LOCAL_DIR"/go.sum \
    "$SERVER:$BACKEND_REMOTE_DIR/"

  rsync -az \
    -e "ssh ${SSH_OPTS[*]}" \
    "$BACKEND_LOCAL_DIR"/migrations/ "$SERVER:$BACKEND_REMOTE_DIR/migrations/"

  echo "==> [Backend 3/5] Shipping the new binary (staged, not yet live)"

  scp "${SSH_OPTS[@]}" "$BACKEND_BINARY" \
    "$SERVER:$BACKEND_REMOTE_DIR/avtopulse-backend.new"

  ssh_ "
    chown '$BACKEND_SERVICE_USER:$BACKEND_SERVICE_USER' '$BACKEND_REMOTE_DIR/avtopulse-backend.new'
    chmod +x '$BACKEND_REMOTE_DIR/avtopulse-backend.new'
  "

  echo "==> [Backend 4/5] Swapping in the new binary and restarting the service"

  # Keep one previous binary as a .bak for a fast manual rollback
  # (mv onto .new only succeeds once the new binary is already staged above,
  # so a failed scp never leaves the service without a binary at all).
  ssh_ "
    mv '$BACKEND_REMOTE_DIR/avtopulse-backend' '$BACKEND_REMOTE_DIR/avtopulse-backend.bak' 2>/dev/null || true
    mv '$BACKEND_REMOTE_DIR/avtopulse-backend.new' '$BACKEND_REMOTE_DIR/avtopulse-backend'
    systemctl restart '$BACKEND_SERVICE_NAME'
  "

  echo "==> [Backend 5/5] Verifying the service came back up"

  sleep 2
  ssh_ "systemctl is-active '$BACKEND_SERVICE_NAME'" || {
    echo "XƏTA: $BACKEND_SERVICE_NAME restart-dan sonra active deyil. Rollback üçün:" >&2
    echo "  ssh -i $SSH_KEY $SERVER \"mv $BACKEND_REMOTE_DIR/avtopulse-backend.bak $BACKEND_REMOTE_DIR/avtopulse-backend && systemctl restart $BACKEND_SERVICE_NAME\"" >&2
    exit 1
  }
  ssh_ "curl -s -o /dev/null -w '    local health check: %{http_code}\n' http://localhost:8090/api/parts/sellers"

  echo "==> Backend deploy tamamlandı."
fi

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

if [ -z "$SKIP_FRONTEND" ]; then
  echo "==> [Frontend 1/6] Syncing source to $SERVER:$REMOTE_DIR"

  ssh_ "mkdir -p '$REMOTE_DIR'"

  rsync -az --delete \
    --exclude .git \
    --exclude node_modules \
    --exclude dist \
    --exclude .env \
    --exclude .env.production \
    --exclude avtopulse-backend \
    --exclude .worktrees \
    --exclude .claude \
    --exclude .superpowers \
    -e "ssh ${SSH_OPTS[*]}" \
    "$LOCAL_DIR"/ "$SERVER:$REMOTE_DIR/"

  echo "==> [Frontend 2/6] Ensuring Node.js 18+ is installed"

  ssh_ '
    if ! command -v node >/dev/null || [ "$(node -e "console.log(process.versions.node.split(\".\")[0])")" -lt 18 ]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    fi

    node -v
    npm -v
  '

  echo "==> [Frontend 3/6] Installing dependencies and building"

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

  echo "==> [Frontend 4/6] Ownership and permissions"

  ssh_ "chown -R '$SERVICE_USER:$SERVICE_USER' '$REMOTE_DIR'"

  # Caddy runs as its own system user and serves dist/ directly.
  ssh_ "chmod -R o+rX '$REMOTE_DIR/dist'"

  echo "==> [Frontend 5/6] Configuring Caddy site for $DOMAIN"

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

  echo "==> [Frontend 6/6] Verifying deployment"

  ssh_ "
    test -f '$REMOTE_DIR/dist/index.html' &&
    echo 'dist/index.html present'
  "

  echo "==> Frontend deploy tamamlandı."
fi

echo "==> Done: https://$DOMAIN/"
echo "==> AutoPulse deploy uğurla tamamlandı."
