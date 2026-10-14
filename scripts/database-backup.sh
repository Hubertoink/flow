#!/bin/sh
set -eu
umask 077
if [ -f /run/flow-backup.env ]; then . /run/flow-backup.env; fi
mkdir -p /backups
target="/backups/flow-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
temporary="$target.partial"
trap 'rm -f "$temporary"' EXIT
pg_dump --format=custom --no-owner --file="$temporary"
mv "$temporary" "$target"
find /backups -maxdepth 1 -type f -name 'flow-*.dump' -mtime +14 -delete
printf 'Flow! database backup completed: %s\n' "$target"
