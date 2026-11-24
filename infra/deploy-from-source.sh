#!/usr/bin/env bash
# Deploy by building the images ON THE VM from your local checkout.
# Use this when GitHub Actions can't run (e.g. an account billing lock) or you don't want GHCR.
# No registry login needed. First build takes ~5–8 minutes on the small VM; later builds are cached.
#
# Usage: ./infra/deploy-from-source.sh <vm-fqdn>
set -euo pipefail
HOST="${1:?usage: deploy-from-source.sh <vm-fqdn>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="src-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"

echo "==> Copying source to the VM"
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude 'frontend/dist' --exclude '.env' \
  --exclude '__pycache__' --exclude '.pytest_cache' --exclude '.ruff_cache' \
  "$ROOT/" "stride@$HOST:/opt/stridebook/src/"

echo "==> Building and starting ($TAG)"
ssh "stride@$HOST" bash -s -- "$TAG" <<'REMOTE'
set -euo pipefail
cd /opt/stridebook
# Local images: no registry prefix, tagged with the commit.
sed -i "s/^TAG=.*/TAG=$1/; s|^IMAGE_PREFIX=.*|IMAGE_PREFIX=stridebook|" .env
cd src
# compose.yml sets name: stridebook, so volumes and containers are the same as a GHCR deploy.
docker compose --env-file ../.env build
docker compose --env-file ../.env up -d --remove-orphans
docker image prune -f >/dev/null
sleep 5
docker compose --env-file ../.env ps
SITE=$(grep ^SITE_ADDRESS= ../.env | cut -d= -f2)
curl -fsS -o /dev/null -w "health: %{http_code}\n" --resolve "$SITE:443:127.0.0.1" "https://$SITE/api/health" \
  || echo "health check failed: docker compose logs api"
REMOTE
