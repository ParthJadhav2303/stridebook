#!/usr/bin/env bash
# Run StrideBook on your Mac against your local Postgres, loaded with the fee book.
#
#   ./scripts/demo-local.sh data/FEE_BOOK.xlsx          # set up (first time ~2 min) and open the app
#   ./scripts/demo-local.sh data/FEE_BOOK.xlsx --fresh  # wipe the demo database and start again
#   ./scripts/demo-local.sh                             # just start it again (keeps the data)
#
# Needs: Postgres running locally (Postgres.app or Homebrew), Python 3.11+, Node 20+.
# Settings (optional env vars): PGUSER (default: your Mac username), PGPASSWORD, PGHOST, PGPORT, DB_NAME.
# Sign in with  mom / stridebook-demo  (admin)  or  coach / stridebook-demo  (coach).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FEEBOOK=""
FRESH=0
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    *) FEEBOOK="$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")" ;;
  esac
done

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-$USER}"
DB_NAME="${DB_NAME:-stridebook_demo}"
DEMO_PASSWORD="stridebook-demo"
export PGHOST PGPORT PGUSER

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- tools -----------------------------------------------------------------
for dir in /Applications/Postgres.app/Contents/Versions/latest/bin /opt/homebrew/opt/postgresql@16/bin \
  /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/bin /usr/local/bin; do
  [ -d "$dir" ] && PATH="$PATH:$dir"
done
command -v psql >/dev/null || die "psql not found. Install Postgres.app (postgresapp.com) or: brew install postgresql@16"
command -v node >/dev/null || die "Node.js not found. Install it: brew install node"

PY=""
for cand in python3.13 python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null && "$cand" -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
    PY="$cand"; break
  fi
done
[ -n "$PY" ] || die "Python 3.11 or newer is needed. Install it: brew install python@3.12"

pg_isready -q || die "Postgres isn't running on $PGHOST:$PGPORT. Start Postgres.app (or: brew services start postgresql@16)."

for port in 8000 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port $port is already in use. Stop whatever is running there (an earlier demo?) and try again."
  fi
done

# --- database --------------------------------------------------------------
if [ "$FRESH" = 1 ]; then
  say "Removing the old demo database ($DB_NAME)"
  dropdb --if-exists "$DB_NAME"
fi
if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  say "Creating database $DB_NAME"
  createdb "$DB_NAME"
fi

export DATABASE_URL="postgresql+psycopg://${PGUSER}${PGPASSWORD:+:$PGPASSWORD}@${PGHOST}:${PGPORT}/${DB_NAME}"
export TRACKING_START=2026-11-01
export SECRET_KEY="local-demo-only-not-for-production-0123456789"
export ENVIRONMENT=development
APP_VERSION="demo-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
export APP_VERSION

# --- backend ---------------------------------------------------------------
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then
  say "Setting up Python packages (first time only)"
  "$PY" -m venv .venv
fi
.venv/bin/pip install -q --disable-pip-version-check -r requirements.txt

say "Updating database tables"
.venv/bin/alembic upgrade head

say "Making sure the demo logins exist"
.venv/bin/python -m app.cli create-user --username mom --name "Mom" --role admin --password "$DEMO_PASSWORD" || true
.venv/bin/python -m app.cli create-user --username coach --name "Coach" --role coach --password "$DEMO_PASSWORD" || true

if [ -n "$FEEBOOK" ]; then
  [ -f "$FEEBOOK" ] || die "Fee book not found: $FEEBOOK"
  say "Loading the fee book ($(basename "$FEEBOOK"))"
  .venv/bin/python -W ignore -m app.ingest_feebook "$FEEBOOK"
fi

# --- frontend --------------------------------------------------------------
cd "$ROOT/frontend"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  say "Installing app packages (first time only)"
  npm ci --no-audit --no-fund --loglevel=error
fi

# --- run -------------------------------------------------------------------
cleanup() { kill "$API_PID" "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

say "Starting the server and the app"
(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --port 8000 --log-level warning) &
API_PID=$!
for _ in $(seq 1 40); do curl -fs http://localhost:8000/api/health >/dev/null 2>&1 && break; sleep 0.5; done
(cd "$ROOT/frontend" && exec npx vite --port 5173 --strictPort --logLevel warn) &
WEB_PID=$!

for _ in $(seq 1 60); do  # wait for the server, then the app
  curl -fs http://localhost:8000/api/health >/dev/null 2>&1 && curl -fs http://localhost:5173/ >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fs http://localhost:5173/api/health >/dev/null || die "The app didn't start. See the messages above."

cat <<EOF

  StrideBook is running:  http://localhost:5173
  Sign in as  mom / $DEMO_PASSWORD   (admin)
           or coach / $DEMO_PASSWORD (coach)
  Tip: in Chrome, open DevTools (Cmd+Opt+I) and toggle the phone view (Cmd+Shift+M).

  Press Ctrl+C here to stop.
EOF
command -v open >/dev/null && open "http://localhost:5173"
wait
