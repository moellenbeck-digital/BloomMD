#!/bin/sh
set -eu

# The plugin is linked into persisted OpenClaw state on every startup. The command is idempotent
# and never enables the runner; operators enable it only after pair succeeds.
OPENCLAW_ENTRYPOINT=/app/openclaw.mjs /opt/bloommd-plugin/scripts/install-plugin.sh --link /opt/bloommd-plugin --force
exec node /app/openclaw.mjs "$@"
