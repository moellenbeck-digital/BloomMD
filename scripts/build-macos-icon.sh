#!/usr/bin/env bash
#
# Builds the macOS app icon from the SVG in `assets/`.
#
# Produces the `.iconset` folder that Electrobun converts to `.icns` during the macOS build. The
# PNGs are committed rather than generated at build time: rasterising the SVG needs Quick Look,
# which is macOS-only and would make the icon depend on the machine that happened to build it. The
# icon changes about once a year; committed PNGs are the honest trade.
#
#   ./scripts/build-macos-icon.sh
#
set -euo pipefail

SOURCE="assets/app-icon-macos-512.svg"
TARGET="packages/desktop/assets/AppIcon.iconset"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -f "$SOURCE" ] || { echo "Fehlt: $SOURCE"; exit 1; }
command -v iconutil >/dev/null || { echo "iconutil fehlt — dieses Skript braucht macOS."; exit 1; }

echo "==> SVG rastern"
# Quick Look renders the SVG at 1024; `sips` cannot read SVG at all.
qlmanage -t -s 1024 -o "$WORK" "$SOURCE" >/dev/null 2>&1
MASTER="$WORK/$(basename "$SOURCE").png"
[ -f "$MASTER" ] || { echo "Rastern fehlgeschlagen."; exit 1; }

echo "==> Größen erzeugen"
ICONSET="$TARGET"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
# macOS expects exactly these names; a missing pair makes `iconutil` refuse the whole set.
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MASTER" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$MASTER" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

echo "==> Prüfen, dass iconutil den Satz akzeptiert"
# Electrobun runs this conversion during the build. Doing it here too means a broken set fails now,
# not during a release build.
iconutil -c icns "$ICONSET" -o "$WORK/verify.icns"

echo "==> Fertig: $TARGET ($(ls "$ICONSET" | wc -l | tr -d " ") Dateien)"
