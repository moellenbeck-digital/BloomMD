#!/usr/bin/env bash
#
# Runs a CI command with a bounded retry for network and package-source failures only (#141).
#
#   scripts/ci-retry-network.sh [--label NAME] [--attempts N] [--timeout SECONDS] [--pause SECONDS] -- COMMAND...
#
# Why: installs that fetch from apt mirrors or the Playwright CDN sometimes hang until the whole
# step times out (about 10 minutes) instead of failing fast. Every attempt gets its own timeout,
# so a hung download is cut off and tried again.
#
# What this does not do: hide failures. Every failed attempt that gets retried is printed as a
# `::warning::` annotation, so a run that needed a retry is visible in the log and summary. After
# the last attempt the script exits with the command's own exit code. A failure that does not look
# like a network or package-source problem (a missing package, a bad argument, a code error) is
# not retried at all and fails at once.
#
# Exit code: 0 on success, otherwise the exit code of the last attempt (124 after a timeout).

set -uo pipefail

label="command"
attempts=3
attempt_timeout=120
pause=15

while [ "$#" -gt 0 ]; do
  case "$1" in
    --label) label="${2:?--label needs a value}"; shift 2 ;;
    --attempts) attempts="${2:?--attempts needs a value}"; shift 2 ;;
    --timeout) attempt_timeout="${2:?--timeout needs a value}"; shift 2 ;;
    --pause) pause="${2:?--pause needs a value}"; shift 2 ;;
    --) shift; break ;;
    *) echo "::error::ci-retry-network: unknown option $1" >&2; exit 2 ;;
  esac
done

if [ "$#" -eq 0 ]; then
  echo "::error::ci-retry-network: no command given (use -- COMMAND...)" >&2
  exit 2
fi
case "$attempts$attempt_timeout$pause" in
  *[!0-9]*) echo "::error::ci-retry-network: --attempts, --timeout and --pause must be whole numbers" >&2; exit 2 ;;
esac
if [ "$attempts" -lt 1 ] || [ "$attempt_timeout" -lt 1 ]; then
  echo "::error::ci-retry-network: --attempts and --timeout must be at least 1" >&2
  exit 2
fi

# Output that marks a transient network or package-source problem. Deliberately narrow:
# "Unable to locate package", unknown flags or compiler errors are real failures.
network_pattern='Temporary failure resolving|Could not resolve|Could not connect|Failed to fetch|Unable to fetch some archives|Connection (timed out|reset|refused|failed)|Network is unreachable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ESOCKETTIMEDOUT|socket hang up|getaddrinfo|Hash Sum mismatch|Mirror sync in progress|Release file .* is not valid yet|Download failed|Timeout was reached|Bad Gateway|Service Unavailable|Gateway Time-?out|HTTP/[0-9.]+ 5[0-9][0-9]|status code 5[0-9][0-9]|(error|Err:[0-9]+).*https?://.* 5[0-9][0-9]'

log="$(mktemp)"
trap 'rm -f "$log"' EXIT

attempt=1
while true; do
  echo "[$label] attempt $attempt/$attempts (timeout ${attempt_timeout}s): $*"
  timeout -k 10 "$attempt_timeout" "$@" 2>&1 | tee "$log"
  status="${PIPESTATUS[0]}"

  if [ "$status" -eq 0 ]; then
    if [ "$attempt" -gt 1 ]; then
      echo "::warning title=$label::succeeded only on attempt $attempt/$attempts"
    fi
    exit 0
  fi

  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    reason="no result within ${attempt_timeout}s (hung network or package source)"
  elif grep -Eiq "$network_pattern" "$log"; then
    reason="network or package-source error (exit code $status)"
  else
    echo "::error title=$label::failed with exit code $status; not a network or package-source error, not retried"
    exit "$status"
  fi

  if [ "$attempt" -ge "$attempts" ]; then
    echo "::error title=$label::attempt $attempt/$attempts failed ($reason); giving up"
    exit "$status"
  fi

  echo "::warning title=$label::attempt $attempt/$attempts failed ($reason); retrying in ${pause}s"
  sleep "$pause"
  attempt=$((attempt + 1))
done
