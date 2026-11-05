#!/usr/bin/env bash
# Installs a pinned XcodeGen release, checked against its published SHA-256, for the macOS CI jobs.
# Used instead of `brew install xcodegen`, which installs whatever version is current that day and runs in the same
# job as the iOS signing material in ios-release.yml. To upgrade: change both values below to the new release's
# xcodegen.zip and the digest GitHub shows for that asset.
set -euo pipefail

XCODEGEN_VERSION="2.46.0"
XCODEGEN_SHA256="4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"

dest="${RUNNER_TEMP:-$(mktemp -d)}/xcodegen-${XCODEGEN_VERSION}"
mkdir -p "$dest"
curl -fsSL -o "$dest/xcodegen.zip" \
  "https://github.com/yonaskolb/XcodeGen/releases/download/${XCODEGEN_VERSION}/xcodegen.zip"
echo "${XCODEGEN_SHA256}  $dest/xcodegen.zip" | shasum -a 256 -c -
unzip -q -o "$dest/xcodegen.zip" -d "$dest"
"$dest/xcodegen/bin/xcodegen" --version
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$dest/xcodegen/bin" >> "$GITHUB_PATH"
fi
