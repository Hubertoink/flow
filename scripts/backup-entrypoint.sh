#!/bin/sh
set -eu
umask 077
# Cron starts jobs with a minimal environment. Retain the connection settings
# inside the container, outside the persistent backup volume.
export -p > /run/flow-backup.env
until pg_isready; do sleep 2; done
/usr/local/bin/flow-database-backup
crond -f -l 2 &
cron_pid=$!
trap 'kill "$cron_pid"; wait "$cron_pid"' TERM INT
wait "$cron_pid"
