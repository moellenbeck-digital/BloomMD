#!/usr/bin/env bash
#
# Verifies the built DMG.
#
# The image is copied to a temporary directory first. That is not a workaround for a flaky tool:
# inside a synced folder (iCloud Drive on `~/Documents`, Dropbox, OneDrive) the daemon can hold the
# file while it uploads, and `hdiutil` then reports
#
#     unable to recognize … as a disk image (Resource temporarily unavailable)
#
# on an image that is perfectly valid — confirmed by copying it out and verifying there. Checking a
# file another process is holding tells you about the daemon, not about the image.
set -euo pipefail

SOURCE="artifacts/stable-macos-arm64-BloomMD.dmg"
[ -f "$SOURCE" ] || { echo "Fehlt: $SOURCE"; exit 1; }

WORK="$(mktemp -d)"
MOUNT_DIR="$WORK/mount"

cleanup() {
  set +e
  hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

cp "$SOURCE" "$WORK/image.dmg"
hdiutil verify "$WORK/image.dmg"

mkdir -p "$MOUNT_DIR"
hdiutil attach "$WORK/image.dmg" -mountpoint "$MOUNT_DIR" -nobrowse -readonly -quiet

APP="$MOUNT_DIR/BloomMD.app"
PLIST="$APP/Contents/Info.plist"
LAUNCHER="$APP/Contents/MacOS/launcher"
ORIGINAL_LAUNCHER="$APP/Contents/MacOS/launcher-electrobun"
EXPECTED_PRODUCT_VERSION="$(node -p "require('./package.json').version")"

[ -d "$APP" ] || { echo "Fehlt im DMG: BloomMD.app"; exit 1; }
[ -f "$PLIST" ] || { echo "Fehlt im DMG: Contents/Info.plist"; exit 1; }

SHORT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
BUILD_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")"
PRODUCT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :BloomMDProductVersion' "$PLIST")"
DEVELOPER_ID_STATUS="$(/usr/libexec/PlistBuddy -c 'Print :BloomMDDeveloperIDStatus' "$PLIST")"

[[ "$SHORT_VERSION" =~ ^[0-9]+[.][0-9]+[.][0-9]+$ ]] || {
  echo "Ungueltige CFBundleShortVersionString: $SHORT_VERSION"
  exit 1
}

[[ "$BUILD_VERSION" =~ ^[0-9]+([.][0-9]+)*$ ]] || {
  echo "Ungueltige CFBundleVersion: $BUILD_VERSION"
  exit 1
}

[ "$PRODUCT_VERSION" = "$EXPECTED_PRODUCT_VERSION" ] || {
  echo "BloomMDProductVersion ($PRODUCT_VERSION) stimmt nicht mit package.json ($EXPECTED_PRODUCT_VERSION) ueberein."
  exit 1
}

[ -n "$DEVELOPER_ID_STATUS" ] || {
  echo "BloomMDDeveloperIDStatus fehlt."
  exit 1
}

[ -x "$LAUNCHER" ] || { echo "Wrapper-Launcher fehlt oder ist nicht ausfuehrbar."; exit 1; }
[ -x "$ORIGINAL_LAUNCHER" ] || { echo "Originaler Electrobun-Launcher fehlt oder ist nicht ausfuehrbar."; exit 1; }
if [ "$DEVELOPER_ID_STATUS" = "configured" ]; then
  file -b "$LAUNCHER" | grep -q 'Mach-O' || { echo "Signed launcher must be native."; exit 1; }
else
  head -n 1 "$LAUNCHER" | grep -q '^#!/bin/sh$' || { echo "Ad-hoc launcher must be a shell guard."; exit 1; }
  grep -q "Bitte ziehe BloomMD zuerst in den Programme-Ordner" "$LAUNCHER" || { echo "Installation hint missing."; exit 1; }
fi
