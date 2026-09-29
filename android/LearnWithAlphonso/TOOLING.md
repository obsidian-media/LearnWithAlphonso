# Android tooling

No Android Studio or emulator exists in the development environment. The
command-line SDK lives at
`D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\android-sdk`
(installed by `setup-android-toolchain.ps1` in that folder; owner decision
2026-09-29 that nothing Android-SDK-related goes anywhere else). Before any
Gradle command in this directory, set:

    $env:ANDROID_HOME = "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\android-sdk"
    $env:GRADLE_USER_HOME = "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\gradle-home"
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"

Then `.\gradlew.bat :core:test` (JVM tests) or `.\gradlew.bat :app:assembleDebug`.
Anything that needs a device is verified in the emulator job of
`.github/workflows/android-ci.yml` or by the owner on a phone.
