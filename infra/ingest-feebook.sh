#!/usr/bin/env bash
# Load the academy's FEE BOOK workbook into the live app on the VM.
# Run from your laptop. Safe to run again: existing students and already-paid months are skipped.
#
# Usage: ./infra/ingest-feebook.sh <vm-fqdn> <FEE_BOOK.xlsx> [--dry-run] [--sheet "DECEMBER 2026"] [--mode upi]
# Needs an admin login on the server first (see docs/runbook.md, "Create the logins").
set -euo pipefail
HOST="${1:?usage: ingest-feebook.sh <vm-fqdn> <FEE_BOOK.xlsx> [options]}"
FILE="${2:?usage: ingest-feebook.sh <vm-fqdn> <FEE_BOOK.xlsx> [options]}"
shift 2
[ -f "$FILE" ] || { echo "File not found: $FILE"; exit 1; }

REMOTE="/tmp/feebook-$$.xlsx"
scp -q "$FILE" "stride@$HOST:$REMOTE"
# printf %q keeps option values with spaces (sheet names) intact on the remote shell.
ARGS=$(printf ' %q' "$@")
# Unquoted heredoc on purpose: $REMOTE and $ARGS expand here; \$API expands on the server.
# shellcheck disable=SC2087
ssh "stride@$HOST" bash -s <<REMOTE_SCRIPT
set -euo pipefail
API=\$(docker ps --filter "label=com.docker.compose.project=stridebook" --filter "label=com.docker.compose.service=api" -q | head -1)
[ -n "\$API" ] || { echo "The api container isn't running. Deploy first."; exit 1; }
docker cp "$REMOTE" "\$API:/tmp/feebook.xlsx"
rm -f "$REMOTE"
docker exec "\$API" python -W ignore -m app.ingest_feebook /tmp/feebook.xlsx $ARGS
docker exec "\$API" rm -f /tmp/feebook.xlsx
REMOTE_SCRIPT
