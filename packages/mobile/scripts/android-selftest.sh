#!/usr/bin/env bash
# Runs the in-app self-test (web build with VITE_BLOOMMD_SELFTEST=1) on a booted emulator or device:
# installs the debug APK, drops `run-selftest` into the app's files and waits for the result.
# Usage: android-selftest.sh <app-debug.apk> [screenshot.png]
set -euo pipefail
apk="$1"
screenshot="${2:-}"
package=app.bloommd.mobile.debug
adb wait-for-device
adb install -r "$apk"
adb shell am force-stop "$package"
adb shell run-as "$package" mkdir -p files
adb shell run-as "$package" rm -f files/selftest-result.json files/selftest-errors.txt
adb shell run-as "$package" touch files/run-selftest
adb shell am start -W -n "$package/app.bloommd.mobile.MainActivity"
for _ in $(seq 1 120); do
  adb shell run-as "$package" test -f files/selftest-result.json && break
  sleep 2
done
if [ -n "$screenshot" ]; then adb exec-out screencap -p > "$screenshot" || true; fi
adb shell run-as "$package" cat files/selftest-errors.txt 2>/dev/null || true
result="$(adb shell run-as "$package" cat files/selftest-result.json)"
echo "$result"
echo "$result" | grep -q '"passed": true'
