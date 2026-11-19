#!/usr/bin/env bash
# Installs the minified (R8) release APK on the running emulator, opens the app, and fails if it crashes or is gone
# after the first screen has had time to load. A keep rule R8 needed but did not get (kotlinx.serialization, Ktor,
# Room, RevenueCat, Supabase) usually shows up here as a crash at launch, not as a build error.
# Used by android-ci.yml's "Minified release launches" job; run from android/LearnWithAlphonso.
set -euo pipefail

APK="${1:-app/build/outputs/apk/release/app-release.apk}"
PKG="com.obsidianmedia.learnwithalphonso"
WAIT_SECONDS="${WAIT_SECONDS:-25}"

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep "$WAIT_SECONDS"

dump_logs() {
  echo "----- crash buffer -----"
  adb logcat -d -b crash || true
  echo "----- last 300 lines of the main log -----"
  adb logcat -d -t 300 || true
}

if ! adb shell pidof "$PKG" >/dev/null; then
  echo "::error::The minified release app is not running ${WAIT_SECONDS}s after launch (crashed or was killed)."
  dump_logs
  exit 1
fi

if adb logcat -d -b crash | grep -q "$PKG"; then
  echo "::error::The minified release app logged a crash at launch."
  dump_logs
  exit 1
fi

echo "The minified release app launched and is still running after ${WAIT_SECONDS}s."
