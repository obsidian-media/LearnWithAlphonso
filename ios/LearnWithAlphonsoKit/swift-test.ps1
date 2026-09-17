# Runs `swift test` (or any swift/swiftc command via $args) for this package
# on Windows, with the exact environment this needed to actually work --
# see docs/HANDOFF-learn-with-alphonso-native-ios.md in the Boardroom repo
# for the full story of why each piece here is necessary.
#
# Requirements this assumes are already true on the machine:
#   - Swift 6.2.4 toolchain installed (NOT 6.4.0 -- that version has an
#     unresolved Foundation-on-Windows bug; 6.0.2 hits a separate MSVC-
#     intrinsics bug. 6.2.4 is the confirmed-working version.)
#   - Visual Studio 2022 (or Build Tools) installed
#   - Windows Developer Mode enabled (Settings -> For Developers) --
#     without this, swift test intermittently fails with
#     "org.swift.Foundation.WindowsError Code=4551" because SwiftPM can't
#     create a required .build\debug symlink without either admin rights
#     or Developer Mode's relaxed symlink privilege.
#
# Usage: powershell -File swift-test.ps1 [swift subcommand and args, default: test]

$swiftArgs = if ($args.Count -gt 0) { $args -join " " } else { "test" }

cmd /c "`"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat`" -arch=x64 && set `"Path=C:\Users\AgentDev\AppData\Local\Programs\Swift\Toolchains\6.2.4+Asserts\usr\bin;C:\Users\AgentDev\AppData\Local\Programs\Swift\Runtimes\6.2.4\usr\bin;%Path%`" && set `"SDKROOT=C:\Users\AgentDev\AppData\Local\Programs\Swift\Platforms\6.2.4\Windows.platform\Developer\SDKs\Windows.sdk`" && cd /d `"$PSScriptRoot`" && swift $swiftArgs"
