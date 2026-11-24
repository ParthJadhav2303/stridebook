#!/bin/sh
# Dump the database and upload it to Azure Blob Storage.
#   daily/   → every run (lifecycle policy deletes after 35 days)
#   monthly/ → also on the 1st of each month (kept ~13 months)
# The SAS token only allows create/write, so the VM cannot read or delete old backups.
set -eu
# shellcheck disable=SC1091
[ -f /etc/backup.env ] && . /etc/backup.env

: "${BACKUP_CONTAINER_URL:?BACKUP_CONTAINER_URL not set}"
: "${BACKUP_SAS:?BACKUP_SAS not set}"

stamp=$(TZ=Asia/Kolkata date +%Y%m%d-%H%M)
file="/tmp/stridebook-${stamp}.dump"

pg_dump --format=custom --no-owner --file="$file"
size=$(wc -c < "$file")
if [ "$size" -lt 1024 ]; then
  echo "backup FAILED: dump suspiciously small (${size} bytes)"; rm -f "$file"; exit 1
fi

upload() {
  curl --fail --silent --show-error --retry 3 -X PUT \
    -H "x-ms-blob-type: BlockBlob" -H "Content-Type: application/octet-stream" \
    --data-binary "@${file}" "${BACKUP_CONTAINER_URL}/$1/stridebook-${stamp}.dump?${BACKUP_SAS}"
}

upload daily
[ "$(TZ=Asia/Kolkata date +%d)" = "01" ] && upload monthly
rm -f "$file"
echo "backup OK: stridebook-${stamp}.dump (${size} bytes)"
