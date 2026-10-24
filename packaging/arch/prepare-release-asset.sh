#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
output_dir="${BLOOMMD_PACKAGE_OUTPUT_DIR:-${repo_root}/packages/desktop/artifacts}"
package_arch="${BLOOMMD_PACKAGE_ARCH:-$(uname -m)}"

case "${package_arch}" in
  x86_64|aarch64) ;;
  *) echo "Unsupported Pacman architecture: ${package_arch}" >&2; exit 2 ;;
esac

package_version="${BLOOMMD_RELEASE_VERSION:-$(node -p "require('${repo_root}/packages/desktop/package.json').version")}"
package_files=(
  "${output_dir}"/bloommd-desktop-*.pkg.tar.zst
)

valid_package_files=()
for package_file in "${package_files[@]}"; do
  if [[ -f "${package_file}" && "${package_file}" != *-debug-*.pkg.tar.zst ]]; then
    valid_package_files+=("${package_file}")
  fi
done

if [[ "${#valid_package_files[@]}" -ne 1 ]]; then
  echo "Expected exactly one non-debug Pacman package in ${output_dir}." >&2
  exit 1
fi

release_file="${output_dir}/bloommd-desktop-${package_version}-${package_arch}.pacman"
cp -f -- "${valid_package_files[0]}" "${release_file}"
echo "Versioned Pacman release asset written to ${release_file}"
