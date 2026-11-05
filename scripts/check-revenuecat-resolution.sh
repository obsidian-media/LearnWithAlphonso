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

# A version tag can be moved to other code, so each pinned package must also resolve to the exact commit that tag
# named when it was pinned. Bumping a version means updating its commit here in the same PR.
EXPECTED_REVISIONS='{"purchases-ios":"e45bb84b726885492ce4e7ee94ddb252d171a205","sentry-cocoa":"4bb2282661ee6ca2212aa01d19a1214394cd3c45"}'
# shellcheck disable=SC2016 # the node script below is single-quoted on purpose: its $ belongs to JavaScript.
node -e '
  const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const expected = JSON.parse(process.argv[2]);
  const pins = data.pins ?? data.object?.pins ?? [];
  let bad = 0;
  for (const [identity, revision] of Object.entries(expected)) {
    const pin = pins.find((p) => String(p.identity ?? p.package ?? "").toLowerCase() === identity);
    const got = pin?.state?.revision ?? "";
    if (got !== revision) {
      console.log(`::error::${identity} resolved to commit ${got || "nothing"}, but its pinned version is ${revision}.`);
      bad = 1;
    } else {
      console.log(`${identity} resolved to the pinned commit ${revision}.`);
    }
  }
  process.exit(bad);
' "$RESOLVED" "$EXPECTED_REVISIONS"
