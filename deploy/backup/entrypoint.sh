#!/bin/sh
# Runs backup.sh on a schedule with busybox crond.
# BACKUP_CRON is in UTC; the default "30 20 * * *" = 02:00 IST.
set -eu

# cron jobs don't inherit the container environment, so save it for backup.sh.
env | grep -E '^(PG|BACKUP_)' | sed 's/^/export /; s/=/="/; s/$/"/' > /etc/backup.env
chmod 600 /etc/backup.env

echo "${BACKUP_CRON:-30 20 * * *} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "backup scheduler started: '${BACKUP_CRON:-30 20 * * *}' (UTC)"
exec crond -f -l 8
