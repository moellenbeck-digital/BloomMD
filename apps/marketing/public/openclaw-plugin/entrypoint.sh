#!/bin/sh
set -eu

# The release archive is installed into the persistent OpenClaw state on startup.
# This is idempotent and deliberately does not enable the BloomMD runner.
OPENCLAW_ENTRYPOINT=/app/openclaw.mjs /opt/bloommd-plugin/scripts/install-plugin.sh --link /opt/bloommd-plugin --force
exec node /app/openclaw.mjs "$@"
