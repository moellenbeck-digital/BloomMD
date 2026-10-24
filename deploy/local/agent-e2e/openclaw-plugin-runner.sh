#!/bin/sh
set -eu

state_dir="${HOME:-/home/node}/.openclaw"
workspace_dir="${state_dir}/workspace"
profile="${BLOOMMD_E2E_PROFILE:?BLOOMMD_E2E_PROFILE is required}"
agent="${BLOOMMD_E2E_AGENT:?BLOOMMD_E2E_AGENT is required}"

mkdir -p "$state_dir" "$workspace_dir/skills/bloommd-workspace-agent"
cp /fixtures/skills/bloommd-workspace-agent/process-task.mjs "$workspace_dir/skills/bloommd-workspace-agent/"
chmod 700 "$workspace_dir/skills/bloommd-workspace-agent"

# This is the same linked plugin installation used by the Docker/Kubernetes operator path.
OPENCLAW_ENTRYPOINT=/app/openclaw.mjs /opt/bloommd-plugin/scripts/install-plugin.sh --link /opt/bloommd-plugin --force
# OpenClaw must create the plugin entry itself before the deterministic model configuration is
# merged. Replacing openclaw.json before installation makes this OpenClaw release reject a linked
# plugin during its capability check.
node /app/openclaw.mjs config patch --file /fixtures/openclaw.json

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

pair_file="/e2e/${agent}.pair"
wait_for_file "$pair_file"
node /app/openclaw.mjs bloommd pair --server "$BLOOMMD_APP_URL" --bloommd-profile "$profile" --pairing-code-file "$pair_file"
touch "/e2e/${agent}.paired"

# The plugin service is intentionally inert until this explicit configuration exists.
node /app/openclaw.mjs config set plugins.entries.bloommd-workspace-agent.config \
  "{\"enabled\":true,\"profile\":\"${profile}\",\"pollIntervalSeconds\":30,\"agentTimeoutSeconds\":60,\"openClawAgentId\":\"bloommd-e2e\",\"workingDirectory\":\"${workspace_dir}\"}" \
  --strict-json

gateway_log="${state_dir}/bloommd-e2e-gateway.log"
node /app/openclaw.mjs gateway --allow-unconfigured > "$gateway_log" 2>&1 &
gateway_pid=$!

stop_gateway() {
  kill "$gateway_pid" 2>/dev/null || true
  wait "$gateway_pid" 2>/dev/null || true
}
trap stop_gateway INT TERM

# The server emits `task-available` only after this authenticated stream is subscribed. Waiting
# for it makes the E2E prove the realtime wake-up instead of racing the OpenClaw gateway bootstrap.
attempts=0
while ! grep -Fq "BloomMD workspace agent realtime connection established as profile ${profile}." "$gateway_log"; do
  attempts=$((attempts + 1))
  if ! kill -0 "$gateway_pid" 2>/dev/null; then
    cat "$gateway_log" >&2
    exit 1
  fi
  if [ "$attempts" -gt 180 ]; then
    echo "Timed out waiting for BloomMD realtime readiness for ${profile}" >&2
    cat "$gateway_log" >&2
    exit 1
  fi
  sleep 1
done
touch "/e2e/${agent}.realtime-ready"

wait "$gateway_pid"
