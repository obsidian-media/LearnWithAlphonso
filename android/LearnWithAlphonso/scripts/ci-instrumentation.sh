#!/usr/bin/env bash
# DIAGNOSTIC (temporary): the emulator goes offline mid-run; keep the device log and host memory to see why.
mkdir -p diag
nohup adb logcat -b all -v threadtime > diag/logcat.txt 2>&1 < /dev/null &
nohup bash -c 'while true; do date +%T; free -m | sed -n 2p; ps -eo rss,comm --sort=-rss | head -4; sleep 2; done' > diag/mem.txt 2>&1 < /dev/null &
./gradlew connectedDebugAndroidTest
status=$?
pkill -f "adb logcat" || true
pkill -f "free -m" || true
exit $status
