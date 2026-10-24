#!/usr/bin/env bash
# Checks a Release App.app (or an .xcarchive) before it goes to App Store Connect:
# privacy manifests, review keys in Info.plist, version from package.json, no self-test code,
# no debug-only native test access, and an app icon without alpha channel.
#
# Usage: scripts/check-ios-release.sh <path/to/App.app | path/to/App.xcarchive> [build-number]
set -euo pipefail

target="${1:?usage: check-ios-release.sh <App.app|App.xcarchive> [build-number]}"
expected_build="${2:-}"
app="$target"
if [[ "$target" == *.xcarchive ]]; then app="$target/Products/Applications/App.app"; fi
package_dir="$(cd "$(dirname "$0")/.." && pwd)"
failures=0

fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }
ok() { echo "ok:   $*"; }

[ -d "$app" ] || { echo "FAIL: $app not found" >&2; exit 1; }
plist="$app/Info.plist"

# Privacy manifests: app target and the BloomFolder plugin bundle.
for manifest in "$app/PrivacyInfo.xcprivacy" "$app/Frameworks/BloommdCapacitorFolder.framework/BloommdCapacitorFolder_Privacy.bundle/PrivacyInfo.xcprivacy"; do
  if [ -f "$manifest" ] && plutil -lint "$manifest" >/dev/null; then ok "privacy manifest ${manifest#"$app/"}"; else fail "missing or invalid ${manifest#"$app/"}"; fi
done
[ "$(plutil -extract NSPrivacyTracking raw -o - "$app/PrivacyInfo.xcprivacy" 2>/dev/null)" = "false" ] && ok "NSPrivacyTracking false" || fail "NSPrivacyTracking must be false"

# Review keys.
[ "$(plutil -extract ITSAppUsesNonExemptEncryption raw -o - "$plist" 2>/dev/null)" = "false" ] && ok "ITSAppUsesNonExemptEncryption false" || fail "ITSAppUsesNonExemptEncryption must be false"
[ "$(plutil -extract CFBundleIdentifier raw -o - "$plist")" = "app.bloommd.mobile" ] && ok "bundle id app.bloommd.mobile" || fail "unexpected bundle id"
if plutil -convert xml1 -o - "$plist" | grep -q "UsageDescription</key>"; then
  fail "Info.plist declares NS*UsageDescription keys; remove the ones the app does not use"
else
  ok "no NS*UsageDescription keys"
fi

# Version: marketing version from package.json, build number from CI.
marketing="$(plutil -extract CFBundleShortVersionString raw -o - "$plist")"
build="$(plutil -extract CFBundleVersion raw -o - "$plist")"
expected_marketing="$(cd "$package_dir" && bun scripts/ios-version.ts | sed -n 's/^MARKETING_VERSION=//p')"
[ "$marketing" = "$expected_marketing" ] && ok "CFBundleShortVersionString $marketing" || fail "CFBundleShortVersionString $marketing, expected $expected_marketing"
if [ -n "$expected_build" ]; then
  [ "$build" = "$expected_build" ] && ok "CFBundleVersion $build" || fail "CFBundleVersion $build, expected $expected_build"
fi

# Self-test code (VITE_BLOOMMD_SELFTEST) must not be in the web bundle.
if grep -rlE "selftest-vault|run-selftest|selftest-result|runSelfTest" "$app/public" >/dev/null 2>&1; then
  fail "self-test code found in public/ (built with VITE_BLOOMMD_SELFTEST?)"
else
  ok "web bundle has no self-test code"
fi

# Debug-only native test access (useTestFolder) must be compiled out.
plugin_binary="$app/Frameworks/BloommdCapacitorFolder.framework/BloommdCapacitorFolder"
if [ -f "$plugin_binary" ] && strings "$plugin_binary" | grep -q "path is required"; then
  fail "BloomFolder plugin contains the debug test-folder access"
else
  ok "no debug test-folder access in the folder plugin"
fi

# App icon source: 1024 px without alpha channel (App Store rejects transparent icons).
icon="$package_dir/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
if command -v sips >/dev/null; then
  if [ "$(sips -g hasAlpha "$icon" | awk '/hasAlpha/ {print $2}')" = "no" ] && [ "$(sips -g pixelWidth "$icon" | awk '/pixelWidth/ {print $2}')" = "1024" ]; then
    ok "app icon 1024 px, no alpha"
  else
    fail "app icon must be 1024x1024 without alpha channel"
  fi
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "Release bundle checks passed ($marketing ($build))"
