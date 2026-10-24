#!/bin/sh
set -eu

state_dir="${HOME:-/home/node}/.openclaw"
mkdir -p "$state_dir" /workspace/skills/bloommd-workspace-agent
cp /fixtures/openclaw.json "$state_dir/openclaw.json"
cp /fixtures/skills/bloommd-workspace-agent/* /workspace/skills/bloommd-workspace-agent/
chmod 700 /workspace/skills/bloommd-workspace-agent

wait_for_file() {
  file="$1"
  attempts=0
  while [ ! -s "$file" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -gt 180 ]; then
      echo "Timed out waiting for $file" >&2
      exit 1
    fi
    sleep 1
  done
}

run_agent() {
  message="$1"
  node /app/openclaw.mjs agent exec --config "$state_dir/openclaw.json" --state-dir "$state_dir" --cwd /workspace --model bloommd-e2e/workspace-agent --json "$message"
}

wait_for_file "/e2e/${BLOOMMD_E2E_AGENT}.pair"
export BLOOMMD_PAIRING_CODE="$(tr -d '\n' < "/e2e/${BLOOMMD_E2E_AGENT}.pair")"
run_agent "Pair this local OpenClaw worker with its assigned BloomMD workspace agent."
test -s "$state_dir/bloommd-agent-token"

wait_for_file "/e2e/${BLOOMMD_E2E_AGENT}.run"
run_agent "Process exactly one assigned BloomMD workspace task and return a reviewable proposal."
test -s "/e2e/${BLOOMMD_E2E_AGENT}.proposal"
touch "/e2e/${BLOOMMD_E2E_AGENT}.completed"

wait_for_file "/e2e/${BLOOMMD_E2E_AGENT}.revoke"
run_agent "Verify that the revoked BloomMD workspace agent credential can no longer poll for tasks."
test -f "/e2e/${BLOOMMD_E2E_AGENT}.revoked"
