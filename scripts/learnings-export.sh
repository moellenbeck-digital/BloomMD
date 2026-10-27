#!/bin/sh
# Writes the static export (index.html + wiki.json) of the learnings vault, e.g. daily from a scheduler.
# The target folder must lie outside the vault; a previous export in it is replaced, anything else is refused.
set -eu

VAULT="${LEARNINGS_VAULT:-/data/learnings}"
OUT="${LEARNINGS_EXPORT_DIR:-/data/learnings-export}"
# Word-split on purpose, so a test can pass `bun run <cli.ts>`.
BIN="${BLOOMMD_WIKI_BIN:-/home/node/.openclaw/bin/bloommd-wiki}"

# shellcheck disable=SC2086
exec $BIN export "$VAULT" "$OUT" --overwrite
