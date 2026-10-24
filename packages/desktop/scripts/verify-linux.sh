#!/usr/bin/env bash
set -euo pipefail

desktop_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
repo_root="$(cd "${desktop_root}/../.." && pwd -P)"
host_arch="${CARCH:-$(uname -m)}"
case "${host_arch}" in
  x86_64) electrobun_arch="x64"; expected_binary="x86-64" ;;
  aarch64|arm64) electrobun_arch="arm64"; expected_binary="ARM aarch64" ;;
  *) echo "Unsupported Linux architecture: ${host_arch}" >&2; exit 2 ;;
esac

app_dir="${BLOOMMD_LINUX_APP_DIR:-${desktop_root}/build/stable-linux-${electrobun_arch}/package-app}"
launcher="${app_dir}/bin/launcher"

[[ -x "${launcher}" ]] || { echo "Missing executable Linux launcher: ${launcher}" >&2; exit 1; }
[[ -x "${app_dir}/bin/bun" ]] || { echo "Missing bundled Bun runtime; self-extracting wrapper was staged instead of the native bundle." >&2; exit 1; }
[[ -f "${app_dir}/bin/libNativeWrapper.so" ]] || { echo "Missing Linux native wrapper." >&2; exit 1; }
[[ -f "${app_dir}/Resources/main.js" ]] || { echo "Missing bundled Electrobun main script." >&2; exit 1; }
[[ -f "${app_dir}/BloomMD.desktop" ]] || { echo "Missing Electrobun desktop metadata." >&2; exit 1; }
for license_file in LICENSE LICENSE-MIT-legacy; do
  cmp -s "${repo_root}/${license_file}" "${app_dir}/Resources/app/${license_file}" || {
    echo "Missing or outdated ${license_file} in Linux application bundle." >&2
    exit 1
  }
done

binary_description="$(file -b "${launcher}")"
case "${binary_description}" in
  *"${expected_binary}"*) ;;
  *) echo "Unexpected launcher architecture: ${binary_description}" >&2; exit 1 ;;
esac

if strings "${launcher}" | grep -Eq 'ELECTROBUN_ARCHIVE_V1|ELECTROBUN_METADATA_V1'; then
  echo "Self-extracting Electrobun wrapper found in native Linux bundle; package the postBuild bundle instead." >&2
  exit 1
fi

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "${app_dir}/BloomMD.desktop"
fi

echo "Verified native Linux ${host_arch} bundle: ${app_dir}"
