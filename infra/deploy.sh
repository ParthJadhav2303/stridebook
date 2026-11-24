#!/usr/bin/env bash
# Deploy a build to the VM. Run from your laptop (SSH is only open to your IP).
# Usage: ./infra/deploy.sh <vm-fqdn> [tag]     tag = git SHA from GitHub Actions, default "latest"
set -euo pipefail
HOST="${1:?usage: deploy.sh <vm-fqdn> [tag]}"
TAG="${2:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

scp "$ROOT/compose.yml" "stride@$HOST:/opt/stridebook/compose.yml"
ssh "stride@$HOST" bash -s -- "$TAG" <<'REMOTE'
set -euo pipefail
cd /opt/stridebook
sed -i "s/^TAG=.*/TAG=$1/" .env
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
sleep 5
docker compose ps
SITE=$(grep ^SITE_ADDRESS= .env | cut -d= -f2)
curl -fsS -o /dev/null -w "health: %{http_code}\n" --resolve "$SITE:443:127.0.0.1" "https://$SITE/api/health" || echo "health check failed: docker compose logs api"
REMOTE

# Optional: load the fee book after deploying, e.g.  FEEBOOK=~/Downloads/FEE_BOOK.xlsx ./infra/deploy...sh <fqdn>
if [ -n "${FEEBOOK:-}" ]; then
  echo "==> Loading fee book $FEEBOOK"
  "$(dirname "$0")/ingest-feebook.sh" "$HOST" "$FEEBOOK"
fi
