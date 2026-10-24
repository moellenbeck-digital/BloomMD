#!/usr/bin/env bash
set -euo pipefail

plugin_version="${BLOOMMD_OPENCLAW_PLUGIN_VERSION:-$(node -p 'require("./plugins/openclaw/package.json").version')}"
latest_url="${BLOOMMD_OPENCLAW_PLUGIN_LATEST_URL:-https://bloommd.io/openclaw-plugin/latest.tgz}"
plugin_url="${BLOOMMD_OPENCLAW_PLUGIN_URL:-https://bloommd.io/openclaw-plugin/${plugin_version}.tgz}"
temp_dir="$(mktemp -d)"
archive_path="$temp_dir/bloommd-openclaw-plugin.tgz"
latest_headers="$temp_dir/latest.headers"

cleanup() {
  docker image rm -f bloommd-openclaw-plugin:release-smoke >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
}
trap cleanup EXIT

curl --fail --location --retry 3 --dump-header "$latest_headers" --output /dev/null "$latest_url"
tr -d '\r' < "$latest_headers" | grep -qi "^x-bloommd-plugin-version: ${plugin_version}$"
curl --fail --location --retry 3 --output "$archive_path" "$plugin_url"
tar -tzf "$archive_path" | grep -Fx 'package/openclaw.plugin.json'
tar -tzf "$archive_path" | grep -Fx 'package/dist/index.js'
archive_version="$(tar -xOf "$archive_path" package/package.json | node -e 'let input=""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(input).version))')"
test "$archive_version" = "$plugin_version"

docker build --file deploy/openclaw/Dockerfile --tag bloommd-openclaw-plugin:release-smoke .
docker run --rm \
  --mount "type=bind,source=$archive_path,target=/plugin/bloommd-openclaw-plugin.tgz,readonly" \
  --entrypoint /bin/sh \
  bloommd-openclaw-plugin:release-smoke \
  -c 'OPENCLAW_ENTRYPOINT=/app/openclaw.mjs /opt/bloommd-plugin/scripts/install-plugin.sh /plugin/bloommd-openclaw-plugin.tgz --force && node /app/openclaw.mjs bloommd --help' \
  | tee /dev/stderr \
  | grep -Fq 'openclaw bloommd'
