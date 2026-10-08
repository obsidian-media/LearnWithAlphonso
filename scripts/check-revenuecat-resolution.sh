#!/usr/bin/env bash
# Fails unless Xcode resolved RevenueCat (purchases-ios) to exactly the exactVersion pinned
# in ios/LearnWithAlphonso/project.yml. Run from the repo root after `xcodegen generate`.
# RC_RESOLVED_FILE overrides the Package.resolved path and skips resolution, so the
# comparison can be exercised without Xcode.
set -euo pipefail

PROJECT_DIR="ios/LearnWithAlphonso"

PIN=$(awk '
  /^packages:/ { in_packages = 1; next }
  in_packages && /^[^ ]/ { in_packages = 0 }
  in_packages && /^  RevenueCat:/ { in_rc = 1; next }
  in_rc && /^  [^ ]/ { in_rc = 0 }
  in_rc && /^    exactVersion:/ { gsub(/"/, "", $2); print $2; exit }
' "$PROJECT_DIR/project.yml" | tr -d '\r')

if [ -z "$PIN" ]; then
  echo "::error::project.yml's RevenueCat package has no exactVersion pin."
  exit 1
fi

RESOLVED="${RC_RESOLVED_FILE:-$PROJECT_DIR/LearnWithAlphonso.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved}"
if [ -z "${RC_RESOLVED_FILE:-}" ]; then
  xcodebuild -resolvePackageDependencies \
    -project "$PROJECT_DIR/LearnWithAlphonso.xcodeproj" \
    -scheme LearnWithAlphonso > /dev/null
fi

if [ ! -f "$RESOLVED" ]; then
  echo "::error::No Package.resolved at $RESOLVED after resolving packages."
  exit 1
fi

GOT=$(node -e '
  const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const pins = data.pins ?? data.object?.pins ?? [];
  const pin = pins.find((p) => ["purchases-ios", "revenuecat"].includes(String(p.identity ?? p.package ?? "").toLowerCase()));
  process.stdout.write(pin?.state?.version ?? "");
' "$RESOLVED")

if [ "$GOT" != "$PIN" ]; then
  echo "::error::RevenueCat resolved to '${GOT:-nothing}' but project.yml pins '$PIN'."
  exit 1
fi

echo "RevenueCat resolved $GOT == pin $PIN."
