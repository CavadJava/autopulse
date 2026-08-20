#!/usr/bin/env bash
#
# AutoPulse — server deploy script
#
# Runs ON THE SERVER (157.180.73.79). Clones/pulls the repo, builds the
# static site, and publishes it to the path Caddy serves for
# autopulse.157.180.73.79.sslip.io.
#
# Usage on the server:
#   curl -fsSL https://raw.githubusercontent.com/CavadJava/autopulse/main/deploy/deploy.sh | bash
#   # or, once the repo is already cloned:
#   bash /opt/autopulse/deploy/deploy.sh
#
set -euo pipefail

REPO_URL="https://github.com/CavadJava/autopulse.git"
APP_DIR="/opt/autopulse"
RELEASE_DIR="/opt/autopulse/dist"
BRANCH="main"

echo "==> AutoPulse deploy başlayır..."

# 1. Clone or update the repo
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Mövcud repo tapıldı, yenilənir..."
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  echo "==> Repo clone edilir..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 2. Install dependencies (npm ci uses package-lock.json for reproducible installs)
echo "==> Asılılıqlar quraşdırılır..."
npm ci

# 3. Build the production bundle
echo "==> Build edilir..."
npm run build

# 4. Verify the build actually produced output before touching anything live
if [ ! -f "$APP_DIR/dist/index.html" ]; then
  echo "XƏTA: build 'dist/index.html' yaratmadı. Deploy dayandırıldı." >&2
  exit 1
fi

echo "==> Build tamamlandı: $RELEASE_DIR"
echo "==> Caddy bu qovluğu birbaşa serve edir (aşağıdakı Caddyfile bloku ilə)."
echo "==> Deploy uğurla bitdi. https://autopulse.157.180.73.79.sslip.io yoxlayın."
