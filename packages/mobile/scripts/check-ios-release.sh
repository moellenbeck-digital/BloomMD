#!/usr/bin/env bash
# Checks a Release App.app (or an .xcarchive) before it goes to App Store Connect:
# privacy manifests (app and both plugins, content against store/PRIVACY-ANSWERS.md), review keys in
# Info.plist, version from package.json, no self-test code, no debug-only native test access,
# app icon and splash, and that the iPad app stays available on Apple-silicon Macs ("Designed for iPad").
#
# The plist, project and PNG parsing lives in scripts/ios-bundle-tools.ts (unit-tested on any OS);
# this script only locates the files, converts binary plists to XML (plutil, macOS) and reports.
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

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tool() { bun "$package_dir/scripts/ios-bundle-tools.ts" "$@"; }
# XML copy of a plist: plutil converts the binary plists Xcode writes; elsewhere the file is XML already.
plist_xml() { if command -v plutil >/dev/null; then plutil -convert xml1 -o "$2" "$1"; else cp "$1" "$2"; fi; }
# Value of a key path (a.b.0) in a plist, empty when missing.
plist_get() { local xml="$work/get.xml"; plist_xml "$1" "$xml" 2>/dev/null && tool get "$xml" "$2" 2>/dev/null || true; }
# One line from the tool's problem list.
one_line() { echo "${1//$'\n'/; }"; }

# Privacy manifests: app target and both plugin bundles, each against store/PRIVACY-ANSWERS.md.
check_privacy() {
  local label="$1" profile="$2" file="$3" xml="$work/privacy-$2.xml" out
  if [ ! -f "$file" ]; then fail "missing $label"; return; fi
  if command -v plutil >/dev/null && ! plutil -lint "$file" >/dev/null; then fail "invalid $label"; return; fi
  plist_xml "$file" "$xml"
  if out="$(tool privacy "$profile" "$xml" 2>&1)"; then ok "privacy manifest $label matches store/PRIVACY-ANSWERS.md"; else fail "privacy manifest $label: $(one_line "$out")"; fi
}
check_privacy "PrivacyInfo.xcprivacy" app "$app/PrivacyInfo.xcprivacy"
for plugin in folder:BloommdCapacitorFolder keychain:BloommdCapacitorKeychain; do
  name="${plugin#*:}"
  check_privacy "Frameworks/$name.framework/${name}_Privacy.bundle" "${plugin%%:*}" "$app/Frameworks/$name.framework/${name}_Privacy.bundle/PrivacyInfo.xcprivacy"
done

# Review keys.
[ "$(plist_get "$plist" ITSAppUsesNonExemptEncryption)" = "false" ] && ok "ITSAppUsesNonExemptEncryption false" || fail "ITSAppUsesNonExemptEncryption must be false"
[ "$(plist_get "$plist" CFBundleIdentifier)" = "app.bloommd.mobile" ] && ok "bundle id app.bloommd.mobile" || fail "unexpected bundle id"
plist_xml "$plist" "$work/Info.xml"
if grep -q "UsageDescription</key>" "$work/Info.xml"; then
  fail "Info.plist declares NS*UsageDescription keys; remove the ones the app does not use"
else
  ok "no NS*UsageDescription keys"
fi

# Version: marketing version from package.json, build number from CI.
marketing="$(plist_get "$plist" CFBundleShortVersionString)"
build="$(plist_get "$plist" CFBundleVersion)"
expected_marketing="$(cd "$package_dir" && bun scripts/ios-version.ts | sed -n 's/^MARKETING_VERSION=//p')"
[ "$marketing" = "$expected_marketing" ] && ok "CFBundleShortVersionString $marketing" || fail "CFBundleShortVersionString $marketing, expected $expected_marketing"
if [ -n "$expected_build" ]; then
  [ "$build" = "$expected_build" ] && ok "CFBundleVersion $build" || fail "CFBundleVersion $build, expected $expected_build"
fi

# "Designed for iPad" on Apple-silicon Macs: the project must not opt out of the Mac and neither
# Info.plist (source or built) may keep the app off it. The App Store Connect availability switch
# itself is not in the bundle and stays a manual check (docs/MOBILE-APP.md).
if out="$(tool mac-project "$package_dir/ios/App/App.xcodeproj/project.pbxproj" 2>&1)"; then
  ok "Xcode project keeps the iPad app available on the Mac"
else
  fail "Xcode project removes the app from the Mac: $(one_line "$out")"
fi
plist_xml "$package_dir/ios/App/App/Info.plist" "$work/Info-source.xml"
if out="$(tool mac-plist "$work/Info-source.xml" 2>&1)"; then ok "Info.plist source has no Mac blockers"; else fail "Info.plist source blocks the Mac: $(one_line "$out")"; fi
if out="$(tool mac-plist "$work/Info.xml" --bundle 2>&1)"; then ok "built Info.plist has no Mac blockers (iPad device family)"; else fail "built Info.plist blocks the Mac: $(one_line "$out")"; fi

# Self-test code (VITE_BLOOMMD_SELFTEST) must not be in the web bundle: neither strings nor a chunk of its own.
if grep -rlE "selftest-vault|run-selftest|selftest-result|selftest-errors|runSelfTest" "$app/public" >/dev/null 2>&1 \
  || find "$app/public" -iname '*selftest*' 2>/dev/null | grep -q .; then
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

# App icon and splash sources: icon 1024 px without alpha channel (App Store rejects transparent
# icons), splash 2732 px for all three scales.
assets="$package_dir/ios/App/App/Assets.xcassets"
if out="$(tool png "$assets/AppIcon.appiconset/AppIcon-512@2x.png" 1024 1024 --no-alpha 2>&1)"; then
  ok "app icon 1024 px, no alpha"
else
  fail "app icon must be 1024x1024 without alpha channel: $(one_line "$out")"
fi
splash_failed=0
for splash in "$assets"/Splash.imageset/*.png; do
  out="$(tool png "$splash" 2732 2732 2>&1)" || { fail "splash ${splash##*/}: $(one_line "$out")"; splash_failed=1; }
done
[ "$splash_failed" -eq 0 ] && ok "splash images 2732 px"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "Release bundle checks passed ($marketing ($build))"
