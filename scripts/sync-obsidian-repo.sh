#!/usr/bin/env bash
# Mirrors plugins/obsidian into a checkout of the public bloommd-obsidian repository.
#
# The plugin ships from its own public repository because Obsidian expects manifest.json, README.md
# and LICENSE at the repository root. This monorepo stays private, so the mirror is explicit and
# reviewable rather than an automatic push. The monorepo remains the only development source; the
# public checkout receives a generated, standalone release snapshot of the shared Core adapter.
#
# Usage:
#   scripts/sync-obsidian-repo.sh ../bloommd-obsidian
#   scripts/sync-obsidian-repo.sh --check ../bloommd-obsidian
set -euo pipefail

mode="sync"
if [[ "${1:-}" == "--check" ]]; then
  mode="check"
  shift
fi

target="${1:?Usage: scripts/sync-obsidian-repo.sh [--check] <path-to-bloommd-obsidian-checkout>}"
target="$(cd "$target" && pwd)"
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$(cd "$(dirname "$0")/.." && pwd)/plugins/obsidian"

[ -d "$target/.git" ] || { echo "error: $target is not a git checkout" >&2; exit 1; }

if [[ "$mode" == "sync" ]]; then
  # Never mirror dependencies or local release folders. Build output is rebuilt below from the
  # exact standalone snapshot, so stale artifacts cannot silently survive a source sync.
  rsync -a --delete \
    --exclude ".git/" \
    --exclude "node_modules/" \
    --exclude "release/" \
    --exclude "/main.js" \
    --exclude "/shared-runtime.js" \
    --exclude "/styles.css" \
    --exclude "/bun.lock" \
    --exclude ".DS_Store" \
    --exclude "MIRROR.json" \
    "$source_dir/" "$target/"

  BLOOMMD_MIRROR_ROOT="$root_dir" \
    BLOOMMD_MIRROR_TARGET="$target" \
    BLOOMMD_MIRROR_MODE=sync \
    bun "$root_dir/scripts/sync-obsidian-mirror.mjs"

  bun install --cwd "$target"
  bun run --cwd "$target" build
else
  BLOOMMD_MIRROR_ROOT="$root_dir" \
    BLOOMMD_MIRROR_TARGET="$target" \
    BLOOMMD_MIRROR_MODE=check \
    bun "$root_dir/scripts/sync-obsidian-mirror.mjs"
fi

cd "$target"
if [[ "$mode" == "check" ]]; then
  bun install --frozen-lockfile
  bun run release:verify
  echo "Public Obsidian mirror is synchronized and its release contract is valid."
else
  bun run release:verify
  echo "Mirrored $(node -p "require('./manifest.json').version") into $target"
  git status --short
  echo
  echo "Review the diff, then commit and tag with the exact manifest version (no v prefix)."
fi
