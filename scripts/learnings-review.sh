#!/bin/sh
# Weekly review of the learnings vault for the chief of staff, e.g. Mondays from a scheduler: prints what is to decide
# (status neu), to renew (expired, expiring) and to merge (duplicates) as a short text, or exactly NO_REPLY when
# there is nothing. It only reads; delivering the text to the chief of staff is the job of the scheduler.
# Extra arguments go to the command (e.g. --days 7 or --json).
set -eu

VAULT="${LEARNINGS_VAULT:-/data/learnings}"
# Word-split on purpose, so a test can pass `bun run <cli.ts>`.
BIN="${BLOOMMD_WIKI_BIN:-/home/node/.openclaw/bin/bloommd-wiki}"

# shellcheck disable=SC2086
exec $BIN agent review --vault "$VAULT" "$@"
