#!/bin/sh
set -eu

# OpenClaw changed capability-consent handling between host releases. Ask the
# installed host which form it supports instead of making callers pin a CLI
# flag. This keeps Docker/Kubernetes and archive QA compatible with both the
# current consent flag and a future interactive/default consent flow.
run_openclaw() {
  if [ -n "${OPENCLAW_ENTRYPOINT:-}" ]; then
    node "$OPENCLAW_ENTRYPOINT" "$@"
  else
    "${OPENCLAW_BIN:-openclaw}" "$@"
  fi
}

if run_openclaw plugins install --help 2>&1 | grep -Fq -- "--accept-capabilities"; then
  run_openclaw plugins install "$@" --accept-capabilities
else
  run_openclaw plugins install "$@"
fi
