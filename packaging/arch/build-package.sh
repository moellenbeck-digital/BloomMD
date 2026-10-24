#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
package_root="${script_dir}/bloommd"
output_dir="${BLOOMMD_PACKAGE_OUTPUT_DIR:-${repo_root}/packages/desktop/artifacts}"

if ! command -v makepkg >/dev/null 2>&1; then
  echo "makepkg is required. Run this on Arch Linux or an Arch-based CI runner." >&2
  exit 127
fi

host_arch="${CARCH:-$(uname -m)}"
case "${host_arch}" in
  x86_64) electrobun_arch="x64" ;;
  aarch64|arm64) electrobun_arch="arm64" ;;
  *) echo "Unsupported Linux architecture: ${host_arch}" >&2; exit 2 ;;
esac

package_arch="${BLOOMMD_PACKAGE_ARCH:-${host_arch}}"
case "${package_arch}" in
  x86_64|aarch64) ;;
  *) echo "Unsupported Pacman architecture: ${package_arch}" >&2; exit 2 ;;
esac

app_dir="${BLOOMMD_LINUX_APP_DIR:-${repo_root}/packages/desktop/build/stable-linux-${electrobun_arch}/package-app}"
if [[ ! -x "${app_dir}/bin/launcher" ]]; then
  echo "Missing Electrobun Linux bundle: ${app_dir}/bin/launcher" >&2
  echo "Build the native Linux app first so the postBuild hook can stage it for packaging." >&2
  exit 1
fi

package_version="${BLOOMMD_PACKAGE_VERSION:-$(node -p "require('${repo_root}/packages/desktop/package.json').version")}"
# Arch pkgver cannot contain SemVer's hyphen; the app itself keeps its canonical SemVer.
package_version="${package_version//-/_}"
icon_path="${BLOOMMD_ICON_PATH:-${repo_root}/packages/desktop/assets/AppIcon.iconset/icon_128x128.png}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/bloommd-makepkg.XXXXXX")"
trap 'rm -rf "${work_dir}"' EXIT

cp "${package_root}/PKGBUILD" "${package_root}/bloommd-launcher" "${package_root}/bloommd.desktop" "${package_root}/bloommd.svg" "${repo_root}/LICENSE" "${repo_root}/LICENSE-MIT-legacy" "${work_dir}/"
mkdir -p "${output_dir}"

(
  cd "${work_dir}"
  BLOOMMD_LINUX_APP_DIR="${app_dir}" \
  BLOOMMD_PACKAGE_VERSION="${package_version}" \
  BLOOMMD_PACKAGE_ARCH="${package_arch}" \
  BLOOMMD_ICON_PATH="${icon_path}" \
  BLOOMMD_LICENSE_PATH="${work_dir}/LICENSE" \
  BLOOMMD_LEGACY_LICENSE_PATH="${work_dir}/LICENSE-MIT-legacy" \
  CARCH="${package_arch}" \
  makepkg --cleanbuild --clean --syncdeps --noconfirm
)

find "${work_dir}" -maxdepth 1 -type f -name 'bloommd-desktop-*.pkg.tar.zst' ! -name 'bloommd-desktop-debug-*.pkg.tar.zst' -exec cp -f {} "${output_dir}/" \;
package_file="$(find "${output_dir}" -maxdepth 1 -type f -name 'bloommd-desktop-*.pkg.tar.zst' ! -name 'bloommd-desktop-debug-*.pkg.tar.zst' -print -quit)"
if [[ -z "${package_file}" ]]; then
  echo "makepkg did not produce a Pacman package." >&2
  exit 1
fi

echo "Pacman package written to ${output_dir}"
