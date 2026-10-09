# Android tooling

No Android Studio or emulator exists in the development environment. The
command-line SDK lives at
a folder outside this repository (the `android-sdk` directory next to the
Gradle home; installed by `setup-android-toolchain.ps1`; owner decision
2026-09-29 that nothing Android-SDK-related goes anywhere else). Before any
Gradle command in this directory, set:

    $env:ANDROID_HOME = "<folder>\android-sdk"
    $env:GRADLE_USER_HOME = "<folder>\gradle-home"
    $env:JAVA_HOME = "<path to a JDK 21 install>"

Then `.\gradlew.bat :core:test` (JVM tests) or `.\gradlew.bat :app:assembleDebug`.
Anything that needs a device is verified in the emulator job of
`.github/workflows/android-ci.yml` or by the owner on a phone.
