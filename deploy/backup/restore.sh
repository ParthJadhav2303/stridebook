#!/bin/sh
# Restore a backup file into the database. DESTRUCTIVE: replaces current data.
# Usage (on the VM):
#   docker compose cp ./stridebook-YYYYMMDD-HHMM.dump backup:/tmp/restore.dump
#   docker compose exec backup restore.sh /tmp/restore.dump
set -eu
# shellcheck disable=SC1091
[ -f /etc/backup.env ] && . /etc/backup.env
file="${1:?usage: restore.sh /path/to/file.dump}"

echo "This will REPLACE all data in database '${PGDATABASE}' with ${file}."
printf "Type RESTORE to continue: "
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "$file"
echo "Restore complete. Restart the api: docker compose restart api"
