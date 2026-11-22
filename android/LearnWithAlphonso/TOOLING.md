> Status (verified 2026-11-22 against d8350542): commands and pins checked against `gradle/libs.versions.toml` and `app/build.gradle.kts`.

# Android tooling

No Android Studio or emulator was set up in the development environment as of 2026-09-29 (unverified for today: machine state, not in the repo). The
command-line SDK lives at
a folder outside this repository (the `android-sdk` directory next to the
Gradle home; installed by `setup-android-toolchain.ps1`, a script that lives outside this repo, its text is in `docs/superpowers/plans/2026-09-29-android-plan-1-foundation-and-learning-loop.md`; owner decision
2026-09-29 that nothing Android-SDK-related goes anywhere else). Before any
Gradle command in this directory, set:

    $env:ANDROID_HOME = "<folder>\android-sdk"
    $env:GRADLE_USER_HOME = "<folder>\gradle-home"
    $env:JAVA_HOME = "<path to a JDK 21 install>"

Then `.\gradlew.bat :core:test` (JVM tests), `.\gradlew.bat :app:testDebugUnitTest` (view-model tests) or `.\gradlew.bat :app:assembleDebug`. Toolchain versions are pinned in `gradle/libs.versions.toml` (AGP 9.4.1, Kotlin 2.4.20, KSP 2.3.12 on 2026-11-22), `compileSdk` 37.2, `targetSdk` 36, `minSdk` 26.
Anything that needs a device is verified in the emulator job of
`.github/workflows/android-ci.yml` or by the owner on a phone.
