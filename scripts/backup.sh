#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  HOARD — nightly database backup (spec 1.1)
#
#  Runs in the `backup` compose service (postgres:16-alpine, busybox sh), so it
#  is plain POSIX sh. Connection settings come from the standard libpq env vars
#  (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#
#  Every day at BACKUP_HOUR (default 3) in TZ it:
#    1. dumps with `pg_dump --format=custom` to a temp file in daily/,
#    2. keeps it only if it is non-empty and `pg_restore --list` can read it,
#       then renames it to daily/hoard-YYYY-MM-DD.dump,
#    3. on Sundays also copies it to weekly/,
#    4. keeps the newest 14 daily and 8 weekly dumps,
#    5. writes status.json {lastSuccess, lastAttempt, lastError, file, bytes}
#       atomically (temp file + rename), which the app reads for Settings.
#
#  Usage:  sh backup.sh          loop forever, one backup a day
#          sh backup.sh --once   make one backup now and exit (0 = success)
#  Env:    BACKUP_DIR (default /backups), BACKUP_HOUR (default 3),
#          KEEP_DAILY (default 14), KEEP_WEEKLY (default 8)
# ─────────────────────────────────────────────────────────────────────────────
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

now_utc() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# JSON string or null. Escapes backslashes and quotes, flattens newlines/tabs.
json_str() {
  if [ -z "$1" ]; then
    printf 'null'
  else
    printf '"%s"' "$(printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g')"
  fi
}

# Read one string field from the previous status.json (empty when absent/null).
prev_field() {
  [ -f "$BACKUP_DIR/status.json" ] || return 0
  sed -n "s/.*\"$1\": *\"\\([^\"]*\\)\".*/\\1/p" "$BACKUP_DIR/status.json" | head -n 1
}

# The previous numeric "bytes" (empty when absent/null).
prev_bytes() {
  [ -f "$BACKUP_DIR/status.json" ] || return 0
  sed -n 's/.*"bytes": *\([0-9][0-9]*\).*/\1/p' "$BACKUP_DIR/status.json" | head -n 1
}

# write_status LAST_SUCCESS LAST_ATTEMPT LAST_ERROR FILE BYTES
write_status() {
  bytes="$5"
  [ -n "$bytes" ] || bytes=null
  tmp="$BACKUP_DIR/.status.json.tmp"
  printf '{"lastSuccess": %s, "lastAttempt": %s, "lastError": %s, "file": %s, "bytes": %s}\n' \
    "$(json_str "$1")" "$(json_str "$2")" "$(json_str "$3")" "$(json_str "$4")" "$bytes" >"$tmp" \
    && mv -f "$tmp" "$BACKUP_DIR/status.json"
}

# Delete all but the newest N files matching a glob in a directory. The names
# are hoard-YYYY-MM-DD.dump, so a reverse name sort is newest first.
prune() {
  dir="$1"
  keep="$2"
  # shellcheck disable=SC2012
  ls -1 "$dir" 2>/dev/null | grep -E '^hoard-[0-9]{4}-[0-9]{2}-[0-9]{2}\.dump$' | sort -r \
    | tail -n "+$((keep + 1))" | while IFS= read -r old; do
      log "pruning $dir/$old"
      rm -f "$dir/$old"
    done
}

# Make one backup. Returns 0 on success and records the outcome in status.json.
backup_once() {
  attempt="$(now_utc)"
  day="$(date '+%Y-%m-%d')"
  weekday="$(date '+%w')" # 0 = Sunday
  mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" || return 1
  final="$BACKUP_DIR/daily/hoard-$day.dump"
  tmp="$BACKUP_DIR/daily/.hoard-$day.dump.tmp"
  errlog="$BACKUP_DIR/.backup-error.log"
  rm -f "$tmp"

  log "dumping ${PGDATABASE:-?} on ${PGHOST:-local} to $final"
  error=""
  if ! pg_dump --format=custom --file="$tmp" 2>"$errlog"; then
    error="pg_dump failed: $(tail -n 3 "$errlog")"
  elif [ ! -s "$tmp" ]; then
    error="pg_dump wrote an empty file"
  elif ! pg_restore --list "$tmp" >/dev/null 2>"$errlog"; then
    error="pg_restore --list could not read the dump: $(tail -n 3 "$errlog")"
  elif ! mv -f "$tmp" "$final"; then
    error="could not rename the dump into place"
  fi
  rm -f "$errlog"

  if [ -n "$error" ]; then
    rm -f "$tmp"
    log "FAILED: $error"
    write_status "$(prev_field lastSuccess)" "$attempt" "$error" "$(prev_field file)" "$(prev_bytes)"
    return 1
  fi

  if [ "$weekday" = "0" ]; then
    wtmp="$BACKUP_DIR/weekly/.hoard-$day.dump.tmp"
    if cp "$final" "$wtmp" && mv -f "$wtmp" "$BACKUP_DIR/weekly/hoard-$day.dump"; then
      log "weekly copy written"
    else
      rm -f "$wtmp"
      log "warning: weekly copy failed"
    fi
  fi

  prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
  prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

  bytes="$(wc -c <"$final" | tr -d ' ')"
  write_status "$(now_utc)" "$attempt" "" "daily/hoard-$day.dump" "$bytes"
  log "ok ($bytes bytes)"
  return 0
}

# Seconds until the next BACKUP_HOUR:00 in local time (TZ). Recomputed after
# every sleep, so DST changes only shift a single night by up to an hour.
seconds_until_next() {
  h="$(date '+%H')"
  m="$(date '+%M')"
  s="$(date '+%S')"
  # Strip leading zeros so sh arithmetic doesn't read 08/09 as octal.
  h="${h#0}"
  m="${m#0}"
  s="${s#0}"
  now=$((h * 3600 + m * 60 + s))
  target=$((BACKUP_HOUR * 3600))
  if [ "$now" -lt "$target" ]; then
    echo $((target - now))
  else
    echo $((86400 - now + target))
  fi
}

if [ "${1:-}" = "--once" ]; then
  backup_once
  exit $?
fi

case "$BACKUP_HOUR" in
  '' | *[!0-9]*)
    log "BACKUP_HOUR must be 0-23, got '$BACKUP_HOUR'"
    exit 1
    ;;
esac
BACKUP_HOUR=$((BACKUP_HOUR + 0))
if [ "$BACKUP_HOUR" -gt 23 ]; then
  log "BACKUP_HOUR must be 0-23, got '$BACKUP_HOUR'"
  exit 1
fi

# Stop promptly on `docker compose stop` (sh as PID 1 ignores SIGTERM by
# default). Sleeping in the background + `wait` lets the trap fire mid-sleep.
trap 'log "stopping"; exit 0' TERM INT

log "backups at ${BACKUP_HOUR}:00 ${TZ:-UTC} into $BACKUP_DIR (keeping $KEEP_DAILY daily, $KEEP_WEEKLY weekly)"
# Catch up straight away if today's dump is missing and its hour has passed.
if [ ! -f "$BACKUP_DIR/daily/hoard-$(date '+%Y-%m-%d').dump" ] && [ "$(date '+%H' | sed 's/^0//')" -ge "$BACKUP_HOUR" ] 2>/dev/null; then
  backup_once || true
fi
while :; do
  wait_s="$(seconds_until_next)"
  log "next backup in ${wait_s}s"
  sleep "$wait_s" &
  wait $!
  backup_once || true
  sleep 60 & # never run twice within the same minute
  wait $!
done
