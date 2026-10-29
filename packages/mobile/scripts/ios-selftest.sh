#!/usr/bin/env bash
# Runs the in-app self-test (web build with VITE_BLOOMMD_SELFTEST=1) on a fresh iPad simulator:
# boots it, installs the simulator build, drops `run-selftest` into Documents, launches the app and
# waits for `selftest-result.json`. Pass/fail is exactly `.passed == true` in that file.
# On GitHub Actions the phase timings and, on failure, the app state, result, JavaScript errors and
# the simulator log are written as annotations (readable without log access) and to <diagnostics-dir>.
# Usage: ios-selftest.sh <App.app> [screenshot.png] [diagnostics-dir]
set -euo pipefail
app="$1"
screenshot="${2:-}"
diag="${3:-}"
bundle=app.bloommd.mobile
polls="${SELFTEST_POLLS:-90}"
interval="${SELFTEST_POLL_SECONDS:-2}"

sim=""
data=""
timings=""
last=$SECONDS
started=$SECONDS

mark() {
  timings="$timings $1=$((SECONDS - last))s"
  last=$SECONDS
}

# Annotation messages are one line on the wire: %, CR and LF are escaped.
annotate() {
  local level="$1" title="$2" text="$3"
  [ -n "${GITHUB_ACTIONS:-}" ] || { echo "[$level] $title: $text"; return 0; }
  local percent='%' cr=$'\r' lf=$'\n'
  text="${text//$percent/%25}"
  text="${text//$cr/%0D}"
  text="${text//$lf/%0A}"
  echo "::$level title=$title::$text"
}

# Bounded run for commands that can hang on a broken simulator (macOS has no timeout(1)).
limited() {
  local seconds="$1"
  shift
  perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
}

diagnostics() {
  local status=$?
  set +e
  trap - EXIT
  local elapsed=$((SECONDS - started))
  if [ "$status" -eq 0 ]; then
    annotate notice "iOS self-test" "passed after ${elapsed}s;$timings"
    exit 0
  fi
  local state="exit=$status after ${elapsed}s;$timings"
  if [ -n "$sim" ]; then
    state="$state
simulator: $(xcrun simctl list devices | grep -F "$sim" | head -1 | sed 's/^ *//')"
    state="$state
app process: $(limited 20 xcrun simctl spawn "$sim" launchctl list 2>&1 | grep -c "UIKitApplication:$bundle") running"
  fi
  if [ -n "$data" ]; then
    state="$state
run-selftest left in Documents: $([ -f "$data/Documents/run-selftest" ] && echo yes || echo no)
Documents: $(ls "$data/Documents" 2>&1 | tr '\n' ' ')"
  fi
  local result="" errors="" simlog=""
  [ -f "$data/Documents/selftest-result.json" ] && result="$(cat "$data/Documents/selftest-result.json")"
  [ -f "$data/Documents/selftest-errors.txt" ] && errors="$(tail -n 40 "$data/Documents/selftest-errors.txt")"
  if [ -n "$sim" ]; then
    simlog="$(limited 120 xcrun simctl spawn "$sim" log show --last 15m --style compact \
      --predicate "process == \"App\" OR process == \"SpringBoard\" OR eventMessage CONTAINS \"$bundle\"" 2>&1 | tail -n 80)"
  fi
  annotate error "iOS self-test state" "$state"
  [ -z "$result" ] || annotate error "iOS self-test result" "$result"
  [ -z "$errors" ] || annotate error "iOS self-test JavaScript errors" "$errors"
  [ -z "$simlog" ] || annotate error "iOS simulator log (tail)" "$simlog"
  if [ -n "$diag" ]; then
    mkdir -p "$diag"
    printf '%s\n' "$state" > "$diag/state.txt"
    printf '%s\n' "$result" > "$diag/selftest-result.json"
    printf '%s\n' "$errors" > "$diag/selftest-errors.txt"
    printf '%s\n' "$simlog" > "$diag/simulator.log"
    ls -t "$HOME/Library/Logs/DiagnosticReports" 2>/dev/null | head -5 > "$diag/crash-reports.txt"
  fi
  exit "$status"
}
trap diagnostics EXIT

# Newest iOS runtime, and the newest iPad Pro that runtime supports (old models are not).
runtime_json="$(xcrun simctl list runtimes -j | jq '[.runtimes[] | select(.isAvailable and .platform == "iOS")] | last')"
runtime="$(jq -r '.identifier' <<< "$runtime_json")"
device_type="$(jq -r '[.supportedDeviceTypes[] | select(.name | startswith("iPad Pro"))] | last | .identifier' <<< "$runtime_json")"
echo "runtime=$runtime device=$device_type"
sim="$(xcrun simctl create bloommd-ci "$device_type" "$runtime")"
mark create
xcrun simctl boot "$sim"
mark boot
xcrun simctl bootstatus "$sim" -b
mark bootstatus
xcrun simctl install "$sim" "$app"
mark install
data="$(xcrun simctl get_app_container "$sim" "$bundle" data)"
mkdir -p "$data/Documents"
touch "$data/Documents/run-selftest"
xcrun simctl launch "$sim" "$bundle"
mark launch
for _ in $(seq 1 "$polls"); do
  [ -f "$data/Documents/selftest-result.json" ] && break
  sleep "$interval"
done
mark wait
if [ -n "$screenshot" ]; then xcrun simctl io "$sim" screenshot "$screenshot" || true; fi
result="$data/Documents/selftest-result.json"
if [ ! -f "$result" ]; then
  echo "No selftest-result.json after $polls polls of ${interval}s (the app did not finish the self-test)." >&2
  exit 1
fi
cat "$result"
jq -e '.passed == true' "$result"
