#!/usr/bin/env bash
# DIAGNOSTIC (temporary): the emulator goes offline mid-run; keep the device log and host memory to see why.
mkdir -p diag
(adb logcat -b all -v threadtime > diag/logcat.txt 2>&1 &)
(while true; do date +%T >> diag/mem.txt; free -m | sed -n 2p >> diag/mem.txt; ps -eo rss,comm --sort=-rss | head -4 >> diag/mem.txt; sleep 2; done &)
./gradlew connectedDebugAndroidTest
