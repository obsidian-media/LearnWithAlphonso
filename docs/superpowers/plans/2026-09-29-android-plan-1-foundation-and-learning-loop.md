# Android Plan 1: Foundation and Learning Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CI-built Android app where a learner signs in, takes placement, plays any lesson of any course with all six question types, reviews due items, earns and loses hearts, XP and streak, and keeps working offline, all against the production backend.

**Architecture:** Two Gradle modules under `android/LearnWithAlphonso/`: `core` (pure JVM Kotlin: content models, ports of the shared TS logic with the same test vectors, Ktor-based network clients over an injected engine) and `app` (Jetpack Compose UI, supabase-kt Auth, Room offline store, manual `AppContainer` wiring). Everything that can be decided in `core` is decided there; `app` only renders and persists.

**Tech Stack:** Kotlin 2.x, AGP 9.x, Gradle 9.x, JDK 17+ (JDK 21 installed), Jetpack Compose (BOM 2026.09.00), Material 3, navigation-compose, Room, kotlinx.serialization, Ktor client (OkHttp engine in app, MockEngine in tests), supabase-kt (auth-kt), JUnit 5 for `core`, AndroidX test for `app`.

**Spec:** `docs/superpowers/specs/2026-09-29-android-app-design.md`

## Follow-on plans (written when this plan lands)

- Plan 2: social and gamification (leaderboard, friends, nudges, duels, teams, season, challenges, achievements, weakness trend, block and report, profile identity, themes sync).
- Plan 3: audio and AI (recorder, Practice scenarios, Campaigns, speak questions online path, Hector, AI disclosure gate, RevenueCat paywall).
- Plan 4: podcasts (library, search, transcripts, resume, play events, offline downloads, Media3 service) and notifications (local via WorkManager, FCM client, the additive backend PR to `main`, Glance widget).
- Plan 5: release (signing, `android-release.yml`, Play listing material, device checklist, Play upload).

## Global Constraints

- Everything Android-SDK-related is installed only under `D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds`. `ANDROID_HOME` points there; nothing is written to the user profile.
- All code lives under `android/LearnWithAlphonso/` plus `scripts/export-android-content.ts` and `.github/workflows/android-ci.yml`. No other shared file is modified in this plan.
- `minSdk = 26`, `targetSdk = 36`, `compileSdk = 36`. Package `com.obsidianmedia.learnwithalphonso`.
- Supabase URL `https://qhcjpfbxfcltjbiuknyt.supabase.co`, publishable key `sb_publishable_mIBGe0mIBTz---kX-vP59A_x0UhYbs9`, API base `https://learn.alphonsoecosystem.app` (from `AppConfig.swift`). These are public client values.
- No secret is committed. The repo is public.
- Every `core` port carries the same test vectors as its TS test file; a vector may not be dropped.
- Commits on branch `android` in worktree `D:\AgentDevWork\repos\LearnWithAlphonso-android`; run git from that directory.
- Content JSON is generated, never hand-edited.

## Review Focus

1. A lesson JSON containing an unknown `type` must fail decoding loudly, not skip the question (pinned in Task 3).
2. A wrong review answer keeps `dueOn == today`, so the offline cache must keep the item due rather than remove it (pinned in Task 11).
3. `computeStreakUpdate` compares ISO dates as UTC midnight; a device in UTC-8 at 23:30 must not compute a 2-day gap for yesterday (pinned in Task 6 with an explicit UTC formatter test).
4. A session refresh failure must sign the user out rather than leave a signed-in shell that 401s forever (pinned in Task 13).
5. `complete-lesson` must receive one answer per real question even when the learner answered a reinforcement question in between (pinned in Task 16's view-model test).

---

### Task 0: Local toolchain under the playground path

**Files:**
- Create: `D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\setup-android-toolchain.ps1`
- Create: `android/LearnWithAlphonso/TOOLING.md`

**Interfaces:**
- Produces: `ANDROID_HOME=D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\android-sdk` with `platforms;android-36`, `build-tools;36.0.0`, `platform-tools`, `cmdline-tools;latest`. Gradle is not installed globally; the Gradle wrapper in Task 1 downloads its own distribution into `GRADLE_USER_HOME=D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\gradle-home`.

- [ ] **Step 1: Write the setup script**

```powershell
# setup-android-toolchain.ps1 -- installs the Android command-line SDK
# under this folder only. Idempotent.
$ErrorActionPreference = "Stop"
$Root = "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds"
$Sdk = Join-Path $Root "android-sdk"
$Tools = Join-Path $Sdk "cmdline-tools"
New-Item -ItemType Directory -Force $Tools | Out-Null
$zip = Join-Path $Root "cmdline-tools.zip"
if (-not (Test-Path (Join-Path $Tools "latest\bin\sdkmanager.bat"))) {
  # Version string is the one Google publishes on developer.android.com/studio#command-tools.
  Invoke-WebRequest "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $Tools -Force
  Rename-Item (Join-Path $Tools "cmdline-tools") "latest"
  Remove-Item $zip
}
$env:ANDROID_HOME = $Sdk
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
$sdkmanager = Join-Path $Tools "latest\bin\sdkmanager.bat"
"y`n" * 20 | & $sdkmanager --sdk_root=$Sdk --licenses | Out-Null
& $sdkmanager --sdk_root=$Sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"
Write-Host "ANDROID_HOME=$Sdk"
```

- [ ] **Step 2: Run it**

Run (PowerShell): `& "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\setup-android-toolchain.ps1"`
Expected: ends with `ANDROID_HOME=D:\...\android-sdk`; `dir android-sdk\platforms\android-36` lists `android.jar`. If the zip URL 404s, read the current filename from https://developer.android.com/studio#command-tools and update the script before retrying.

- [ ] **Step 3: Write TOOLING.md**

```markdown
# Android tooling

No Android Studio or emulator exists in the development environment. The
command-line SDK lives at
`D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\android-sdk`
(installed by `setup-android-toolchain.ps1` in that folder). Before any
Gradle command in this directory, set:

    $env:ANDROID_HOME = "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\android-sdk"
    $env:GRADLE_USER_HOME = "D:\AgentDevWork\repos\test\LearnWithAlphonsoFablePlayGrounds\gradle-home"
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"

Then `.\gradlew.bat :core:test` (JVM tests) or `.\gradlew.bat :app:assembleDebug`.
Anything that needs a device is verified in `.github/workflows/android-ci.yml`'s
emulator job or by the owner on a phone.
```

- [ ] **Step 4: Commit**

```bash
git add android/LearnWithAlphonso/TOOLING.md
git commit -m "chore(android): document local toolchain location"
```

---

### Task 1: Gradle project skeleton with pinned versions

**Files:**
- Create: `android/LearnWithAlphonso/settings.gradle.kts`
- Create: `android/LearnWithAlphonso/build.gradle.kts`
- Create: `android/LearnWithAlphonso/gradle.properties`
- Create: `android/LearnWithAlphonso/gradle/libs.versions.toml`
- Create: `android/LearnWithAlphonso/gradle/wrapper/gradle-wrapper.properties` (+ wrapper jar and scripts via `gradle wrapper` from a downloaded distribution)
- Create: `android/LearnWithAlphonso/core/build.gradle.kts`
- Create: `android/LearnWithAlphonso/app/build.gradle.kts`
- Create: `android/LearnWithAlphonso/app/src/main/AndroidManifest.xml`
- Create: `android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/MainActivity.kt`
- Create: `android/LearnWithAlphonso/core/src/test/kotlin/com/obsidianmedia/learnwithalphonso/core/SmokeTest.kt`
- Create: `android/LearnWithAlphonso/.gitignore`

**Interfaces:**
- Produces: modules `:core` (JVM, `kotlin("jvm")`, JUnit 5) and `:app` (Android application depending on `:core`). Version catalog aliases used by every later task: `libs.kotlinx.serialization.json`, `libs.ktor.client.core`, `libs.ktor.client.okhttp`, `libs.ktor.client.mock`, `libs.ktor.client.content.negotiation`, `libs.ktor.serialization.json`, `libs.supabase.auth`, `libs.androidx.room.runtime/ktx/compiler`, `libs.androidx.navigation.compose`, `libs.androidx.security.crypto`, `libs.androidx.browser`, `libs.junit.jupiter`, `libs.kotlinx.coroutines.test`.

- [ ] **Step 1: Write `settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "LearnWithAlphonso"
include(":core", ":app")
```

- [ ] **Step 2: Write `gradle/libs.versions.toml`**

Pins below are the baselines verified 2026-09-29. On the first `gradlew` run, if any coordinate fails to resolve, replace it with the newest version Maven Central reports for that artifact and record the change in the commit message. Do not downgrade below: AGP 9.0, Kotlin 2.2, Compose BOM 2026.09.00.

```toml
[versions]
agp = "9.4.0"
kotlin = "2.2.21"
ksp = "2.2.21-2.0.4"
composeBom = "2026.09.00"
activityCompose = "1.12.0"
navigationCompose = "2.9.6"
lifecycle = "2.10.0"
room = "2.8.3"
securityCrypto = "1.1.0"
browser = "1.9.0"
ktor = "3.3.2"
serialization = "1.9.0"
coroutines = "1.10.2"
supabase = "3.3.0"
junit5 = "5.13.4"
workmanager = "2.11.0"

[libraries]
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-client-mock = { module = "io.ktor:ktor-client-mock", version.ref = "ktor" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
supabase-auth = { module = "io.github.jan-tennert.supabase:auth-kt", version.ref = "supabase" }
androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { module = "androidx.compose.ui:ui" }
androidx-compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
androidx-compose-material3 = { module = "androidx.compose.material3:material3" }
androidx-compose-material-icons = { module = "androidx.compose.material:material-icons-extended" }
androidx-compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
androidx-compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "navigationCompose" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
androidx-room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
androidx-room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
androidx-security-crypto = { module = "androidx.security:security-crypto", version.ref = "securityCrypto" }
androidx-browser = { module = "androidx.browser:browser", version.ref = "browser" }
androidx-work-runtime = { module = "androidx.work:work-runtime-ktx", version.ref = "workmanager" }
junit-jupiter = { module = "org.junit.jupiter:junit-jupiter", version.ref = "junit5" }
junit-platform-launcher = { module = "org.junit.platform:junit-platform-launcher" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
```

- [ ] **Step 3: Write root `build.gradle.kts` and `gradle.properties`**

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
```

```properties
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
org.gradle.caching=true
org.gradle.configuration-cache=true
android.useAndroidX=true
kotlin.code.style=official
```

- [ ] **Step 4: Write `core/build.gradle.kts`**

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.kotlinx.coroutines.test)
    testRuntimeOnly(libs.junit.platform.launcher)
}
sourceSets {
    // The bundled content the app ships is the fixture core tests decode --
    // one copy in git, not two (spec section 5).
    test { resources.srcDir("../app/src/main/assets") }
}
tasks.test { useJUnitPlatform() }
```

- [ ] **Step 5: Write `app/build.gradle.kts`**

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}
android {
    namespace = "com.obsidianmedia.learnwithalphonso"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.obsidianmedia.learnwithalphonso"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Public client values (AppConfig.swift). Not secrets.
        buildConfigField("String", "SUPABASE_URL", "\"https://qhcjpfbxfcltjbiuknyt.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_mIBGe0mIBTz---kX-vP59A_x0UhYbs9\"")
        buildConfigField("String", "API_BASE_URL", "\"https://learn.alphonsoecosystem.app\"")
        // Injected by CI from REVENUECAT_ANDROID_PUBLIC_KEY; empty means "Pro unavailable this build" (Plan 3).
        buildConfigField("String", "REVENUECAT_PUBLIC_KEY", "\"${System.getenv("REVENUECAT_ANDROID_PUBLIC_KEY") ?: ""}\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlin { jvmToolchain(17) }
    buildTypes {
        release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(project(":core"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.work.runtime)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.supabase.auth)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
```

- [ ] **Step 6: Write the manifest and a placeholder activity**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:name=".AlphonsoApplication"
        android:label="Learn with Alphonso"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/Theme.Alphonso"
        android:supportsRtl="true">
        <activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`MainActivity.kt` for now renders `Text("Learn with Alphonso")` inside `setContent`; `AlphonsoApplication` is an empty `Application` subclass. Add `res/values/themes.xml` with `<style name="Theme.Alphonso" parent="android:Theme.Material.Light.NoActionBar"/>` and an adaptive launcher icon generated from `ios/LearnWithAlphonso/Sources/Assets.xcassets/AppIcon.appiconset`'s 1024 PNG scaled to 108 dp foreground on a `#0C6944` background (`res/mipmap-anydpi-v26/ic_launcher.xml` + drawable). Note: `res/` and the icon are part of this task.

- [ ] **Step 7: Write the smoke test**

```kotlin
package com.obsidianmedia.learnwithalphonso.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SmokeTest {
    @Test fun `toolchain runs junit5`() { assertEquals(4, 2 + 2) }
}
```

- [ ] **Step 8: Install the wrapper and run**

Run (from `android/LearnWithAlphonso`, env from TOOLING.md): download `https://services.gradle.org/distributions/gradle-9.6.0-bin.zip` into `GRADLE_USER_HOME`, unzip, run `<gradle>/bin/gradle wrapper --gradle-version 9.6.0 --distribution-type bin`, then `.\gradlew.bat :core:test :app:assembleDebug`.
Expected: `BUILD SUCCESSFUL`, `SmokeTest` passes, `app/build/outputs/apk/debug/app-debug.apk` exists. Fix any version-resolution failure by bumping the catalog entry as described in Step 2.

- [ ] **Step 9: Write `.gitignore` and commit**

```
.gradle/
build/
local.properties
*.iml
.idea/
.kotlin/
```

```bash
git add android/LearnWithAlphonso
git commit -m "feat(android): Gradle skeleton with core and app modules"
```

---

### Task 2: Content export script for Android

**Files:**
- Create: `scripts/export-android-content.ts`
- Create: `android/LearnWithAlphonso/app/src/main/assets/content/*.json` (generated)

**Interfaces:**
- Produces: ten JSON files identical in shape to the iOS bundle: `curriculum-en.json`, `curriculum-fr.json`, `curriculum-es.json`, `scenarios.json`, `campaigns.json`, `achievements.json`, `vocab-images.json`, `placement-en.json`, `placement-fr.json`, `placement-es.json`.

- [ ] **Step 1: Write the script**

```ts
/**
 * Writes the Android app's bundled content JSON. Same builders, same
 * output shape as scripts/export-ios-content.ts; only the destination
 * differs. Deliberately a separate script (owner decision 2026-09-29:
 * the Android pipeline stays independent of the iOS one).
 *
 * Usage: bun scripts/export-android-content.ts
 * android-ci.yml regenerates and fails on any diff.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildIOSContentBundle,
  buildIOSScenariosBundle,
  buildIOSCampaignsBundle,
  buildIOSAchievementsBundle,
  buildIOSVocabImagesBundle,
  buildIOSPlacementBundle,
} from "../src/lib/ios-content-export";

const OUT_DIR = path.resolve(
  import.meta.dirname,
  "../android/LearnWithAlphonso/app/src/main/assets/content",
);

function writeJSON(filename: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);
}

writeJSON("curriculum-en.json", buildIOSContentBundle("en"));
writeJSON("curriculum-fr.json", buildIOSContentBundle("fr"));
writeJSON("curriculum-es.json", buildIOSContentBundle("es"));
writeJSON("scenarios.json", buildIOSScenariosBundle());
writeJSON("campaigns.json", buildIOSCampaignsBundle());
writeJSON("achievements.json", buildIOSAchievementsBundle());
writeJSON("vocab-images.json", buildIOSVocabImagesBundle());
writeJSON("placement-en.json", buildIOSPlacementBundle("en"));
writeJSON("placement-fr.json", buildIOSPlacementBundle("fr"));
writeJSON("placement-es.json", buildIOSPlacementBundle("es"));
```

- [ ] **Step 2: Run it and diff against iOS**

Run (Git Bash, repo root of the worktree): `bun scripts/export-android-content.ts && diff -r ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources android/LearnWithAlphonso/app/src/main/assets/content && echo IDENTICAL`
Expected: `IDENTICAL`.

- [ ] **Step 3: Commit**

```bash
git add scripts/export-android-content.ts android/LearnWithAlphonso/app/src/main/assets
git commit -m "feat(android): content export script and bundled content"
```

---

### Task 3: Content models and decoding

**Files:**
- Create: `core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/content/Question.kt`
- Create: `core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/content/ContentModels.kt`
- Create: `core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/content/PlacementQuestion.kt`
- Create: `core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/content/ContentStore.kt`
- Test: `core/src/test/kotlin/com/obsidianmedia/learnwithalphonso/core/content/ContentDecodingTest.kt`

**Interfaces:**
- Produces: `sealed interface Question` with `data class MultipleChoice(id, prompt, choices, answer: Int, explanation, imageKey: String?, audioText: String?)`, `FillInBlank(id, prompt, bank, answer, explanation)`, `Reorder(id, prompt, tokens, answer, explanation)`, `Listening(id, prompt, audioText, choices, answer: String, explanation)`, `Speak(id, prompt, answer, explanation)`, `Translate(id, prompt, acceptableAnswers, explanation)`; each has `val id: String` and `val explanation: String` on the interface. `Lesson(id, title, subtitle, questions)`, `Unit(id, level, eyebrow, title, description, lessons)`, `ContentBundle(course, units)`, `Scenario`, `CampaignScene`, `Campaign`, `Achievement`, `VocabImageRef(url, alt, credit)`. `enum class Course(val code: String) { ENGLISH("en"), FRENCH("fr"), SPANISH("es") }`. `sealed interface PlacementQuestion` (`MultipleChoice`, `Listening`, `Translate`, each with `id` and `level`). `class ContentStore(loadResource: (String) -> String)` exposing `bundle(course)`, `placementPool(course)`, `scenarios`, `campaigns`, `achievements`, `vocabImages: Map<String, VocabImageRef>`, `findLesson(id, course): Pair<Unit, Lesson>?`. `ContentJson.json` is the shared `Json { ignoreUnknownKeys = true }` instance.

- [ ] **Step 1: Write the failing decoding test**

```kotlin
package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.SerializationException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ContentDecodingTest {
    private fun resource(name: String) =
        checkNotNull(javaClass.getResourceAsStream("/content/$name")) { "missing $name" }
            .bufferedReader().readText()

    @Test fun `decodes every bundled course and finds a lesson`() {
        val store = ContentStore(::resource)
        assertEquals("en", store.bundle(Course.ENGLISH).course)
        val (unit, lesson) = checkNotNull(store.findLesson("u1l1", Course.ENGLISH))
        assertEquals("u1", unit.id)
        assertEquals("Saying Hello", lesson.title)
        assertTrue(lesson.questions.first() is Question.MultipleChoice)
        assertTrue(store.bundle(Course.FRENCH).units.isNotEmpty())
        assertTrue(store.bundle(Course.SPANISH).units.isNotEmpty())
        assertEquals(5, store.placementPool(Course.ENGLISH).map { it.level }.distinct().size)
        assertTrue(store.achievements.size >= 24)
        assertTrue(store.vocabImages.containsKey("children"))
    }

    @Test fun `every question type in the english bundle decodes to its own case`() {
        val store = ContentStore(::resource)
        val kinds = store.bundle(Course.ENGLISH).units.flatMap { it.lessons }.flatMap { it.questions }
            .map { it::class.simpleName }.toSet()
        assertEquals(setOf("MultipleChoice", "FillInBlank", "Reorder", "Listening", "Speak", "Translate"), kinds)
    }

    @Test fun `an unknown question type fails loudly instead of being skipped`() {
        val json = """{"course":"en","units":[{"id":"u","level":"A1","eyebrow":"e","title":"t","description":"d",
            "lessons":[{"id":"l","title":"t","subtitle":"s","questions":[{"id":"q1","type":"hologram","prompt":"p","explanation":"x"}]}]}]}"""
        assertThrows(SerializationException::class.java) { ContentJson.json.decodeFromString(ContentBundle.serializer(), json) }
    }

    @Test fun `listening answer is text and mc answer is an index`() {
        val store = ContentStore(::resource)
        val listening = store.bundle(Course.ENGLISH).units.flatMap { it.lessons }.flatMap { it.questions }
            .filterIsInstance<Question.Listening>().first()
        assertTrue(listening.choices.contains(listening.answer))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `.\gradlew.bat :core:test --tests "*ContentDecodingTest*"`
Expected: compilation failure (types do not exist).

- [ ] **Step 3: Implement the models**

`Question.kt`:

```kotlin
package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.*
import kotlinx.serialization.json.*

/** Mirrors src/data/curriculum.ts's `Question` union; "type" picks the case. */
@Serializable(with = QuestionSerializer::class)
sealed interface Question {
    val id: String
    val explanation: String

    @Serializable data class MultipleChoice(
        override val id: String, val prompt: String, val choices: List<String>, val answer: Int,
        override val explanation: String, val imageKey: String? = null, val audioText: String? = null,
    ) : Question
    @Serializable data class FillInBlank(
        override val id: String, val prompt: String, val bank: List<String>, val answer: String, override val explanation: String,
    ) : Question
    @Serializable data class Reorder(
        override val id: String, val prompt: String, val tokens: List<String>, val answer: String, override val explanation: String,
    ) : Question
    @Serializable data class Listening(
        override val id: String, val prompt: String, val audioText: String, val choices: List<String>, val answer: String, override val explanation: String,
    ) : Question
    @Serializable data class Speak(
        override val id: String, val prompt: String, val answer: String, override val explanation: String,
    ) : Question
    @Serializable data class Translate(
        override val id: String, val prompt: String, val acceptableAnswers: List<String>, override val explanation: String,
    ) : Question
}

/**
 * Fails loudly on an unknown type, same reasoning as CurriculumModels.swift:
 * content ships in the binary and CI fails on drift, so a lenient skip would
 * only ever hide a lesson whose question count no longer matches the server's.
 */
object QuestionSerializer : JsonContentPolymorphicSerializer<Question>(Question::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<Question> =
        when (val type = element.jsonObject["type"]?.jsonPrimitive?.contentOrNull) {
            "mc" -> Question.MultipleChoice.serializer()
            "fill" -> Question.FillInBlank.serializer()
            "reorder" -> Question.Reorder.serializer()
            "listening" -> Question.Listening.serializer()
            "speak" -> Question.Speak.serializer()
            "translate" -> Question.Translate.serializer()
            else -> throw SerializationException("Unknown question type: $type")
        }
}

object ContentJson {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
}
```

`ContentModels.kt`: `@Serializable` data classes `Lesson`, `Unit`, `ContentBundle`, `Scenario(id,title,emoji,blurb,level,systemPrompt,opener)`, `CampaignScene(id,title,systemPrompt,opener,minTurns)`, `Campaign(id,title,emoji,blurb,level,premise,scenes)`, `Achievement(id,title,description,icon,tier,category,threshold)`, `VocabImageRef(url,alt,credit)`, plus `enum class Course(val code: String) { ENGLISH("en"), FRENCH("fr"), SPANISH("es"); companion object { fun fromCode(c: String) = entries.first { it.code == c } } }`.

`PlacementQuestion.kt`: same pattern with cases `MultipleChoice(id, level, prompt, choices, answer: Int)`, `Listening(id, level, prompt, audioText, choices, answer: String)`, `Translate(id, level, prompt, acceptableAnswers)`; serializer throws on unknown type; `val placementOrder = listOf("A1","A2","B1","B2","C1")`.

`ContentStore.kt`:

```kotlin
class ContentStore(private val load: (String) -> String) {
    private val bundles = Course.entries.associateWith { decode<ContentBundle>("curriculum-${it.code}.json") }
    private val placement = Course.entries.associateWith { decode<List<PlacementQuestion>>("placement-${it.code}.json") }
    val scenarios: List<Scenario> = decode("scenarios.json")
    val campaigns: List<Campaign> = decode("campaigns.json")
    val achievements: List<Achievement> = decode("achievements.json")
    val vocabImages: Map<String, VocabImageRef> = decode("vocab-images.json")

    fun bundle(course: Course): ContentBundle = bundles.getValue(course)
    fun placementPool(course: Course): List<PlacementQuestion> = placement.getValue(course)
    fun findLesson(id: String, course: Course): Pair<Unit, Lesson>? =
        bundle(course).units.firstNotNullOfOrNull { u -> u.lessons.firstOrNull { it.id == id }?.let { u to it } }

    private inline fun <reified T> decode(name: String): T = ContentJson.json.decodeFromString(load(name))
}
```

- [ ] **Step 4: Run tests**

Run: `.\gradlew.bat :core:test --tests "*ContentDecodingTest*"`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add android/LearnWithAlphonso/core
git commit -m "feat(android-core): content models, loud-failing question decoding, ContentStore"
```

---

### Task 4: SRS engine port

**Files:**
- Create: `core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/SrsEngine.kt`
- Test: `core/src/test/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/SrsEngineTest.kt`

**Interfaces:**
- Produces: `data class ReviewGradeInput(correct: Boolean, ease: Double, intervalDays: Int, repetitions: Int, lapses: Int, elapsedDays: Int)`, `data class ReviewGradeResult(retired, ease, intervalDays, repetitions, lapses)`, `fun computeReviewGrade(input): ReviewGradeResult`, `sealed interface ReviewOutcome { data class Retired(dueOn: String); data class Rescheduled(dueOn, ease, intervalDays, repetitions, lapses) }`, `fun computeReviewOutcome(input, today: String, addDays: (Int) -> String): ReviewOutcome`.

- [ ] **Step 1: Write the failing tests (vectors from `src/lib/srs.test.ts`)**

```kotlin
class SrsEngineTest {
    private fun g(correct: Boolean, ease: Double, interval: Int, reps: Int, lapses: Int, elapsed: Int) =
        computeReviewGrade(ReviewGradeInput(correct, ease, interval, reps, lapses, elapsed))

    @Test fun `halves repetitions on a wrong answer and records a lapse`() {
        val r = g(false, 2.3, 6, 2, 1, 6)
        assertFalse(r.retired); assertEquals(2.1, r.ease, 1e-9); assertEquals(1, r.repetitions); assertEquals(3, r.intervalDays); assertEquals(2, r.lapses)
    }
    @Test fun `drops to a fresh restart when repetitions halves to zero`() {
        val r = g(false, 2.3, 1, 1, 0, 1); assertEquals(0, r.repetitions); assertEquals(1, r.intervalDays)
    }
    @Test fun `scales the post-lapse interval off the prior interval`() {
        val established = g(false, 2.6, 40, 3, 0, 40); val fresh = g(false, 2.6, 3, 2, 0, 3)
        assertEquals(1, established.repetitions); assertEquals(1, fresh.repetitions)
        assertEquals(20, established.intervalDays); assertEquals(2, fresh.intervalDays)
    }
    @Test fun `floors ease at 1_3`() { assertEquals(1.3, g(false, 1.35, 0, 0, 0, 0).ease, 1e-9) }
    @Test fun `first correct repetition is 1 day`() {
        val r = g(true, 2.3, 0, 0, 0, 0); assertEquals(2.45, r.ease, 1e-9); assertEquals(1, r.intervalDays); assertEquals(1, r.repetitions)
    }
    @Test fun `second correct repetition is 3 days`() { val r = g(true, 2.45, 1, 1, 0, 1); assertEquals(3, r.intervalDays); assertEquals(2, r.repetitions) }
    @Test fun `third repetition grows by ease on schedule`() { val r = g(true, 2.6, 3, 2, 0, 3); assertEquals(3, r.repetitions); assertEquals(Math.round(3 * 2.75).toInt(), r.intervalDays) }
    @Test fun `overdue growth bonus caps at 1_5x`() {
        val onTime = g(true, 2.6, 3, 2, 0, 3); val overdue = g(true, 2.6, 3, 2, 0, 30)
        assertEquals(Math.round(3 * 2.75 * 1.5).toInt(), overdue.intervalDays); assertTrue(overdue.intervalDays > onTime.intervalDays)
    }
    @Test fun `retires after 4 clean repetitions`() { val r = g(true, 2.75, 8, 3, 0, 8); assertTrue(r.retired); assertEquals(4, r.repetitions) }
    @Test fun `caps ease at 2_8`() { assertEquals(2.8, g(true, 2.75, 10, 1, 0, 10).ease, 1e-9) }
    @Test fun `falls back to 6 days when growth rounds to zero`() { assertEquals(6, g(true, 1.3, 0, 2, 0, 0).intervalDays) }

    private val today = "2026-09-14"
    private val addDays = { d: Int -> "2026-09-%02d".format(14 + d) }
    @Test fun `outcome schedules a correct answer using the grown interval`() {
        val o = computeReviewOutcome(ReviewGradeInput(true, 2.3, 0, 0, 0, 0), today, addDays) as ReviewOutcome.Rescheduled
        assertEquals("2026-09-15", o.dueOn); assertEquals(1, o.intervalDays); assertEquals(1, o.repetitions)
    }
    @Test fun `outcome keeps a wrong answer due today`() {
        val o = computeReviewOutcome(ReviewGradeInput(false, 2.3, 6, 2, 0, 6), today, addDays) as ReviewOutcome.Rescheduled
        assertEquals(today, o.dueOn); assertEquals(1, o.lapses)
    }
    @Test fun `outcome retires with dueOn today`() {
        val o = computeReviewOutcome(ReviewGradeInput(true, 2.75, 8, 3, 0, 8), today, addDays)
        assertEquals(ReviewOutcome.Retired(today), o)
    }
}
```

- [ ] **Step 2: Run to verify failure** — `.\gradlew.bat :core:test --tests "*SrsEngineTest*"` fails to compile.

- [ ] **Step 3: Implement (port of `src/lib/srs.ts`)**

```kotlin
package com.obsidianmedia.learnwithalphonso.core.logic

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class ReviewGradeInput(val correct: Boolean, val ease: Double, val intervalDays: Int, val repetitions: Int, val lapses: Int, val elapsedDays: Int)
data class ReviewGradeResult(val retired: Boolean, val ease: Double, val intervalDays: Int, val repetitions: Int, val lapses: Int)

private const val MIN_EASE = 1.3
private const val MAX_EASE = 2.8
private const val EASE_STEP_DOWN = 0.2
private const val EASE_STEP_UP = 0.15
private const val RETIRE_AFTER_REPETITIONS = 4
private const val MAX_OVERDUE_GROWTH_BONUS = 1.5
private const val LAPSE_REPETITIONS_RETENTION = 0.5
private const val LAPSE_INTERVAL_RETENTION = 0.5

/** Port of src/lib/srs.ts computeReviewGrade. Keep in sync; same vectors in SrsEngineTest. */
fun computeReviewGrade(input: ReviewGradeInput): ReviewGradeResult {
    val ease = if (input.correct) min(MAX_EASE, input.ease + EASE_STEP_UP) else max(MIN_EASE, input.ease - EASE_STEP_DOWN)
    if (!input.correct) {
        val repetitions = floor(input.repetitions * LAPSE_REPETITIONS_RETENTION).toInt()
        val intervalDays = max(1, (input.intervalDays * LAPSE_INTERVAL_RETENTION).roundToInt())
        return ReviewGradeResult(false, ease, intervalDays, repetitions, input.lapses + 1)
    }
    val repetitions = input.repetitions + 1
    if (repetitions >= RETIRE_AFTER_REPETITIONS) return ReviewGradeResult(true, ease, input.intervalDays, repetitions, input.lapses)
    if (repetitions == 1) return ReviewGradeResult(false, ease, 1, repetitions, input.lapses)
    if (repetitions == 2) return ReviewGradeResult(false, ease, 3, repetitions, input.lapses)
    val overdueBonus = if (input.intervalDays > 0) min(MAX_OVERDUE_GROWTH_BONUS, max(1.0, input.elapsedDays.toDouble() / input.intervalDays)) else 1.0
    val grown = (input.intervalDays * ease * overdueBonus).roundToInt()
    return ReviewGradeResult(false, ease, if (grown != 0) grown else 6, repetitions, input.lapses)
}

sealed interface ReviewOutcome {
    val dueOn: String
    data class Retired(override val dueOn: String) : ReviewOutcome
    data class Rescheduled(override val dueOn: String, val ease: Double, val intervalDays: Int, val repetitions: Int, val lapses: Int) : ReviewOutcome
}

fun computeReviewOutcome(input: ReviewGradeInput, today: String, addDays: (Int) -> String): ReviewOutcome {
    val grade = computeReviewGrade(input)
    if (grade.retired) return ReviewOutcome.Retired(today)
    val dueOn = if (input.correct) addDays(grade.intervalDays) else today
    return ReviewOutcome.Rescheduled(dueOn, grade.ease, grade.intervalDays, grade.repetitions, grade.lapses)
}
```

Note: JS `Math.round` rounds half up; Kotlin `roundToInt` rounds half away from zero, identical for the positive values here.

- [ ] **Step 4: Run tests** — expected 14 pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): SRS engine port with TS vectors"`

---

### Task 5: Hearts economy port

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/HeartsEconomy.kt`
- Test: `core/src/test/kotlin/.../core/logic/HeartsEconomyTest.kt`

**Interfaces:**
- Produces: `object HeartsEconomy { const val MAX_HEARTS = 5; const val HEART_REFILL_MS = 30*60*1000L; const val STREAK_HEART_MILESTONE_DAYS = 7; const val XP_HEART_COST = 50; data class HeartsState(hearts: Int, heartsRefillAt: Long?); fun resolveHeartsRefill(hearts, heartsRefillAt: Long?, now: Long): HeartsState; fun gainHearts(hearts, amount): HeartsState; fun perfectLessonBonusEarned(correct, total): Boolean; fun streakHeartMilestoneReached(old, new): Boolean; sealed interface XpPurchaseResult { Ok(hearts, xp); HeartsFull; InsufficientXp }; fun buyHeartWithXp(hearts, xp, cost = XP_HEART_COST) }`. Timestamps are epoch milliseconds, matching the Edge Function's `heartsRefillAt`.

- [ ] **Step 1: Failing tests (vectors from `hearts.test.ts`)**

```kotlin
class HeartsEconomyTest {
    private val now = 1_700_000_000_000L
    @Test fun `no refill pending leaves hearts alone`() = assertEquals(HeartsEconomy.HeartsState(3, null), HeartsEconomy.resolveHeartsRefill(3, null, now))
    @Test fun `before the timestamp leaves hearts alone`() = assertEquals(HeartsEconomy.HeartsState(0, now + 1000), HeartsEconomy.resolveHeartsRefill(0, now + 1000, now))
    @Test fun `after the timestamp restores to max and clears`() = assertEquals(HeartsEconomy.HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(0, now - 1, now))
    @Test fun `exactly at the timestamp restores`() = assertEquals(HeartsEconomy.HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(0, now, now))
    @Test fun `gain adds up to the cap and clears the timer`() {
        assertEquals(HeartsEconomy.HeartsState(4, null), HeartsEconomy.gainHearts(3, 1))
        assertEquals(HeartsEconomy.HeartsState(5, null), HeartsEconomy.gainHearts(4, 3))
        assertEquals(HeartsEconomy.HeartsState(1, null), HeartsEconomy.gainHearts(0, 1))
    }
    @Test fun `perfect lesson bonus`() { assertTrue(HeartsEconomy.perfectLessonBonusEarned(8, 8)); assertFalse(HeartsEconomy.perfectLessonBonusEarned(7, 8)); assertFalse(HeartsEconomy.perfectLessonBonusEarned(0, 0)) }
    @Test fun `streak milestone`() {
        assertTrue(HeartsEconomy.streakHeartMilestoneReached(6, 7)); assertFalse(HeartsEconomy.streakHeartMilestoneReached(7, 7))
        assertFalse(HeartsEconomy.streakHeartMilestoneReached(7, 8)); assertTrue(HeartsEconomy.streakHeartMilestoneReached(13, 14)); assertTrue(HeartsEconomy.streakHeartMilestoneReached(20, 21))
    }
    @Test fun `buy heart with xp`() {
        assertEquals(HeartsEconomy.XpPurchaseResult.Ok(3, 50), HeartsEconomy.buyHeartWithXp(2, 100))
        assertEquals(HeartsEconomy.XpPurchaseResult.HeartsFull, HeartsEconomy.buyHeartWithXp(5, 1000))
        assertEquals(HeartsEconomy.XpPurchaseResult.InsufficientXp, HeartsEconomy.buyHeartWithXp(2, 49))
        assertEquals(HeartsEconomy.XpPurchaseResult.Ok(3, 0), HeartsEconomy.buyHeartWithXp(2, 50))
    }
}
```

- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** as a direct port of `src/lib/hearts.ts` (`resolveHeartsRefill` returns max when `heartsRefillAt != null && now >= heartsRefillAt`; `gainHearts` = `min(MAX, hearts+amount)` with null timer; `perfectLessonBonusEarned` = `total > 0 && correct == total`; `streakHeartMilestoneReached` = `new > old && new % 7 == 0`; `buyHeartWithXp` checks full then cost).
- [ ] **Step 4: Run, expect 8 pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): hearts economy port"`

---

### Task 6: Progress math port

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/ProgressMath.kt`
- Test: `core/src/test/kotlin/.../core/logic/ProgressMathTest.kt`

**Interfaces:**
- Produces: `fun computeXpGain(correct, total): Int`; `data class StreakInput(lastActiveDate: String?, today: String, streak, longestStreak, freezes)`; `data class StreakResult(streak, longestStreak, freezes)`; `fun computeStreakUpdate(StreakInput)`; `val LEAGUES = listOf("bronze","silver","sapphire","ruby","diamond")`; `val LEAGUE_THRESHOLDS = listOf(0,300,1000,3000,8000)`; `data class LeaguePromotion(leagueTier: String, newIdx: Int)`; `fun computeLeaguePromotion(xp, oldIdx)`; `data class LessonReplayXp(bestCorrect, bestXp, xpGain)`; `fun computeLessonReplayXp(existing: Pair<Int,Int>?, correct, total)`; `fun utcDateString(epochMillis: Long): String`.

- [ ] **Step 1: Failing tests (vectors from `progress-math.test.ts`, plus the UTC pin)**

```kotlin
class ProgressMathTest {
    @Test fun `xp gain`() { assertEquals(30, computeXpGain(3, 5)); assertEquals(70, computeXpGain(5, 5)); assertEquals(0, computeXpGain(0, 6)) }

    private fun s(last: String?, streak: Int = 4, longest: Int = 10, freezes: Int = 1, today: String = "2026-09-13") =
        computeStreakUpdate(StreakInput(last, today, streak, longest, freezes))
    @Test fun `same day no change`() = assertEquals(StreakResult(4, 10, 1), s("2026-09-13"))
    @Test fun `first ever activity starts at 1`() { val r = s(null); assertEquals(1, r.streak); assertEquals(1, r.freezes) }
    @Test fun `consecutive day extends`() { val r = s("2026-09-12"); assertEquals(5, r.streak); assertEquals(10, r.longestStreak) }
    @Test fun `missed day bridged by a freeze`() { val r = s("2026-09-11"); assertEquals(5, r.streak); assertEquals(0, r.freezes) }
    @Test fun `missed day without freeze resets`() { val r = s("2026-09-11", freezes = 0); assertEquals(1, r.streak) }
    @Test fun `wide gap resets regardless of freezes`() = assertEquals(1, s("2026-09-01").streak)
    @Test fun `longest streak rises`() = assertEquals(11, s("2026-09-12", streak = 10, longest = 10).longestStreak)
    @Test fun `bonus freeze on every 10th day`() { val r = s("2026-09-12", streak = 9, longest = 9, freezes = 0); assertEquals(10, r.streak); assertEquals(1, r.freezes) }
    @Test fun `no freeze when resetting near a milestone`() { val r = s("2026-09-01", streak = 9, longest = 9, freezes = 0); assertEquals(1, r.streak); assertEquals(0, r.freezes) }
    @Test fun `date diff is computed in UTC, not device zone`() {
        // Review Focus 3: 23:30 in UTC-8 is 07:30 UTC the next day; the ISO strings are already UTC dates, so the diff is 1.
        assertEquals(5, s("2026-09-12", today = "2026-09-13").streak)
        assertEquals("2026-09-13", utcDateString(1789293000000L)) // 2026-09-13T07:30:00Z
    }

    @Test fun `league promotion`() {
        assertEquals(LeaguePromotion("bronze", 0), computeLeaguePromotion(50, 0))
        assertEquals(LeaguePromotion("ruby", 3), computeLeaguePromotion(3200, 0))
        assertEquals(LeaguePromotion("diamond", 4), computeLeaguePromotion(8000, 0))
        assertEquals(LeaguePromotion("diamond", 4), computeLeaguePromotion(0, 4))
    }
    @Test fun `replay xp`() {
        assertEquals(LessonReplayXp(5, 70, 70), computeLessonReplayXp(null, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 70, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 70, 2, 5))
        assertEquals(LessonReplayXp(5, 70, 50), computeLessonReplayXp(2 to 20, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 999, 5, 5))
    }
}
```

- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement**

```kotlin
package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.math.max

fun computeXpGain(correct: Int, total: Int): Int = correct * 10 + if (correct == total) 20 else 0

/** ISO "yyyy-MM-dd" for an epoch-millis instant, in UTC -- the server's date convention. */
fun utcDateString(epochMillis: Long): String = Instant.ofEpochMilli(epochMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()

private fun daysDiff(a: String, b: String): Int = ChronoUnit.DAYS.between(LocalDate.parse(a), LocalDate.parse(b)).toInt()

data class StreakInput(val lastActiveDate: String?, val today: String, val streak: Int, val longestStreak: Int, val freezes: Int)
data class StreakResult(val streak: Int, val longestStreak: Int, val freezes: Int)

fun computeStreakUpdate(input: StreakInput): StreakResult {
    var streak = input.streak
    var freezes = input.freezes
    val last = input.lastActiveDate
    if (last == input.today) {
        // same day, no change
    } else if (last == null) {
        streak = 1
    } else {
        val diff = daysDiff(last, input.today)
        streak = when {
            diff == 1 -> input.streak + 1
            diff == 2 && freezes > 0 -> { freezes -= 1; input.streak + 1 }
            else -> 1
        }
    }
    if (streak > input.streak && streak % 10 == 0) freezes += 1
    return StreakResult(streak, max(input.longestStreak, streak), freezes)
}

val LEAGUES = listOf("bronze", "silver", "sapphire", "ruby", "diamond")
val LEAGUE_THRESHOLDS = listOf(0, 300, 1000, 3000, 8000)
data class LeaguePromotion(val leagueTier: String, val newIdx: Int)

fun computeLeaguePromotion(xp: Int, oldIdx: Int): LeaguePromotion {
    var newIdx = oldIdx
    for (i in LEAGUES.indices.reversed()) if (xp >= LEAGUE_THRESHOLDS[i]) { newIdx = max(oldIdx, i); break }
    return LeaguePromotion(LEAGUES[newIdx], newIdx)
}

data class LessonReplayXp(val bestCorrect: Int, val bestXp: Int, val xpGain: Int)

/** `existing` is (correct, xpEarned) of the stored completion, or null on a first completion. */
fun computeLessonReplayXp(existing: Pair<Int, Int>?, correct: Int, total: Int): LessonReplayXp {
    val attemptXp = computeXpGain(correct, total)
    if (existing == null) return LessonReplayXp(correct, attemptXp, attemptXp)
    val (prevCorrect, prevXp) = existing
    val bestCorrect = max(prevCorrect, correct)
    val bestXp = computeXpGain(bestCorrect, total)
    return LessonReplayXp(bestCorrect, bestXp, max(0, bestXp - prevXp))
}
```

Check `computeLessonReplayXp` against `src/lib/progress-math.ts` lines 120-160 before committing; the last vector (`xpEarned 999`) must yield `xpGain 0`, which `max(0, …)` gives.

- [ ] **Step 4: Run, expect 13 pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): progress math port"`

---

### Task 7: Spoken and written answer normalisers (EN, FR, ES)

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/SpokenAnswer.kt`, `SpokenAnswerFr.kt`, `SpokenAnswerEs.kt`, `TranslationAnswer.kt`
- Test: `core/src/test/kotlin/.../core/logic/SpokenAnswerTest.kt`, `SpokenAnswerFrTest.kt`, `SpokenAnswerEsTest.kt`, `TranslationAnswerTest.kt`

**Interfaces:**
- Produces: `object SpokenAnswer { fun normalise(s): String; fun matches(transcript, expected): Boolean }`, same for `SpokenAnswerFr`, `SpokenAnswerEs`; `object TranslationAnswer { fun normalise(s) = SpokenAnswer.normalise(s); fun matches(submission, acceptable: List<String>): Boolean }`.

- [ ] **Step 1: Failing tests** — transcribe every `it(...)` in `src/lib/spoken-answer.test.ts`, `spoken-answer-fr.test.ts`, `spoken-answer-es.test.ts`, `translation-answer.test.ts` one-to-one into JUnit assertions (the vectors are quoted in full in those files; copy every string literally, including `"we are meeting at the caf\u00e9 later"`, `"un être humain"`, `"dehesa"`). Name each Kotlin test after the TS `it` description.

- [ ] **Step 2: Run, expect compile failure.**

- [ ] **Step 3: Implement**

`SpokenAnswer.kt`: port of `src/lib/spoken-answer.ts`. Use `java.text.Normalizer.normalize(s, NFD)` then remove `\p{Mn}` (`Regex("\\p{Mn}+")`), lowercase; apply CONTRACTIONS in the TS order using `Regex` with `\b` (Kotlin regex is Java regex; `\b` semantics match JS for ASCII); strip `['’]`; apply APOSTROPHE_LESS; replace FILLER `\b(?:um|uh|erm|er|ah)\b` with space; NUMBER_WORDS zero to ninety; replace `[^a-z0-9\s]` with space; collapse whitespace; trim. `matches` returns false on empty normalised transcript.

`SpokenAnswerFr.kt`: port of `spoken-answer-fr.ts` with `ELIDABLE = listOf("j","m","t","s","l","d","n","c","qu","jusqu","lorsqu","puisqu","quoiqu")`, `VOWEL_OR_MUTE_H = "aeiouyàâäéèêëïîôöùûüh"` (applied after NFD fold, so also include plain vowels only; keep the literal for parity), `SI_ELISION = Regex("\\bsi (ils?)\\b") -> "s $1"`, FILLER `\b(?:euh|hum)\b`, NUMBER_WORDS zéro..seize, vingt..soixante, cent, mille (no un/une).

`SpokenAnswerEs.kt`: port of `spoken-answer-es.ts`: fold, FILLER `\b(?:eh)\b` first, then `stripSilentH` (remove `h` unless previous char is `c`), NUMBER_WORDS cero..veintinueve, treinta..noventa, cien, mil (no un/una), punctuation strip, collapse.

`TranslationAnswer.kt`: `matches` returns false on empty normalised submission or empty list; otherwise `acceptable.any { normalise(it) == written }`.

- [ ] **Step 4: Run all four test classes, expect all pass.** If a French or Spanish vector fails, compare against the TS regex order character by character before changing a vector; vectors are never edited.
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): spoken and written answer normalisers with TS vectors"`

---

### Task 8: Question grading and placement logic

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/QuestionGrading.kt`, `PlacementLogic.kt`
- Test: `core/src/test/kotlin/.../core/logic/QuestionGradingTest.kt`, `PlacementLogicTest.kt`

**Interfaces:**
- Produces: `fun isAnswerCorrect(question: Question, picked: String?, course: Course = Course.ENGLISH): Boolean`; `fun playablePlacementPool(pool, canPlayAudio): List<PlacementQuestion>`; `fun pickPlacementSet(pool, random: kotlin.random.Random = Random.Default): List<PlacementQuestion>`; `fun groupByBand(questions): Map<String, List<PlacementQuestion>>`; `data class AdaptiveBandDecision(stop: Boolean, skipped: String?, nextIdx: Int)`; `fun nextAdaptiveBand(bandPool, currentIdx, correctInBand)`; `data class PlacementScore(level: String, passed: List<String>)`; `fun scorePlacement(correctByLevel: Map<String, Int>)`; `fun isPlacementAnswerCorrect(question, answer: String?)`.

- [ ] **Step 1: Failing tests**

`QuestionGradingTest`: mc exact choice text, fill/reorder/listening case-insensitive trimmed, translate via `TranslationAnswer`, speak via course-selected normaliser (`Course.FRENCH` accepts `"j ai faim"` for `"J'ai faim."`), null picked is false.

`PlacementLogicTest` (vectors from `src/data/placement.test.ts`, using the real bundled `placement-en.json` decoded through `ContentStore`): 3 per band in order; picks only from pool; no duplicates; a band with 2 candidates yields 2; `scorePlacement` cases (all zero → A1/[]; A1=1 → A1/[]; A1=2 → A2/[A1]; A1=3,A2=3,B1=1 → B1/[A1,A2]; all 3 → C1/all; empty map → A1/[]); `groupByBand` keeps every band key; `nextAdaptiveBand` vectors: `(full,0,0)→stop`, `(empty,0,0)→stop`, `(full,0,1)→(false,null,1)`, `(full,0,3)→(false,"A2",2)`, `(full,2,3)→(false,"B2",4)`, `(full,3,3)→(false,null,4)`, `(full,4,3)→(false,null,5)`, `(full,4,0)→stop idx 4`, `(a1Only,0,3)→(false,null,1)`; `isPlacementAnswerCorrect` for mc index text, listening text, translate acceptable list, blank answer false.

- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** as direct ports of `QuestionGrading.swift`, `PlacementLogic.swift` and `placement.ts` (Fisher-Yates via `shuffled(random)` per band then `take(3)`; `scorePlacement` walks `placementOrder` while `>= 2`, level is the band after the last passed, capped at C1).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): question grading and placement logic"`

---

### Task 9: Vocab derivation, reinforcement pick, review badge

**Files:**
- Create: `core/src/main/kotlin/.../core/logic/VocabDerivation.kt`, `LessonReinforcement.kt`, `ReviewBadge.kt`
- Test: `core/src/test/kotlin/.../core/logic/VocabDerivationTest.kt`, `LessonReinforcementTest.kt`, `ReviewBadgeTest.kt`

**Interfaces:**
- Produces: `data class VocabItem(term, meaning, example, image: VocabImageRef?)`; `fun deriveVocab(lesson, images: Map<String, VocabImageRef>): List<VocabItem>`; `fun fnv1aHash(s: String): UInt`; `fun pickReinforcementQuestion(sibling: List<Question>, level: List<Question>, doingWell: Boolean, seed: String): Question?`; `object ReviewBadge { fun text(dueCount: Int): String? }`.

- [ ] **Step 1: Failing tests** — vocab: `u1l1` yields terms `["Good morning.", "meet", "I am fine, thanks.", "Good", ...]` deduped case-insensitively, fill example replaces `___`, mc example is `"<prompt without trailing colon> → <answer>"`, reorder/listening/speak/translate contribute nothing; reinforcement: `fnv1aHash("abc") == 0x1A47E90Bu`, empty pools → null, `doingWell` prefers level pool, same seed same pick; badge: `0 → null`, `7 → "7"`, `150 → "99+"`.
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** as ports of `VocabDerivation.swift`, `LessonReinforcement.swift` (FNV-1a 32-bit: offset `2166136261u`, prime `16777619u`), `ReviewBadge.swift`.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): vocab derivation, reinforcement pick, review badge"`

---

### Task 10: ProgressSyncClient (Edge Functions, RPCs, PostgREST reads)

**Files:**
- Create: `core/src/main/kotlin/.../core/net/SupabaseHttp.kt`
- Create: `core/src/main/kotlin/.../core/net/ProgressSyncClient.kt`
- Create: `core/src/main/kotlin/.../core/net/Models.kt`
- Test: `core/src/test/kotlin/.../core/net/ProgressSyncClientTest.kt`

**Interfaces:**
- Produces: `class SupabaseHttp(baseUrl: String, anonKey: String, accessToken: () -> String, engine: HttpClientEngine)` building a Ktor `HttpClient` with `ContentNegotiation(json)` and default headers `apikey` and `Authorization: Bearer <token>`. `class ProgressSyncClient(http: SupabaseHttp)` with suspend functions: `loseHeart(): HeartsResult`, `restoreHeartsIfDue(): HeartsRefillResult`, `setCefrLevel(course: String, level: String)`, `savePlacementResult(course, level, score)`, `startLessonSession(lessonId, course): String`, `completeLesson(lessonId, total, answers: List<LessonAnswer>, course, sessionToken): LessonCompletionResult`, `fetchDueReviews(course): DueReviews`, `gradeReview(itemKey, answer, course): ReviewGradeOutcome`, `claimReviewClearBonus(course): ReviewClearBonus`, `fetchProgress(): LessonCompletionProgress?`, `fetchCompletedLessonIds(course): List<String>`, `fetchCefrLevel(course): String?`, `fetchPlacementTakenAt(course): String?`, `fetchUnlockedAchievements(): List<UnlockedAchievement>`, `fetchProfileTheme(userId): String?`, `updateProfileTheme(theme, userId)`. `sealed class ProgressSyncError : Exception { Server(status: Int, message: String?), InvalidPayload }`. Models in `Models.kt`: `LessonAnswer(questionId, answer)`, `LessonCompletionProgress(xp, streak, longestStreak, lastActiveDate, hearts, heartsRefillAt: Double?, streakFreezes, leagueTier)`, `LessonCompletionResult(xpGain, newlyUnlocked, heartsBonus: String?, progress)`, `ReviewItem(itemKey, lessonId, level, ease, intervalDays, repetitions, dueOn, source, weaknessDisplay?, prompt?, choices?, answerIndex?, explanation?)`, `DueReviews(due, total)`, `ReviewGradeOutcome(retired, dueOn, correct: Boolean?)`, `ReviewClearBonus(granted, hearts?)`, `HeartsResult(hearts)`, `HeartsRefillResult(hearts, heartsRefillAt: Double?)`, `UnlockedAchievement(achievementId, progress)`.
- Request shapes must match `ProgressSyncClient.swift` exactly: RPCs are `POST rest/v1/rpc/<name>` with the `_param` JSON body; Edge Functions are `POST functions/v1/<name>`; reads are `GET rest/v1/<table>?select=...` and the due-review count uses `HEAD` with `Prefer: count=exact` parsing `Content-Range`.

- [ ] **Step 1: Failing tests with `MockEngine`** — for each method assert URL path, method, headers (`apikey`, `Authorization`), body fields, and decode a canned response. Include: `completeLesson` sends `answers` as `[{"questionId","answer"}]` and decodes `heartsBonus: null`; `gradeReview` decodes a missing `correct` as null; `fetchDueReviews` parses `Content-Range: 0-19/42` into `total = 42`; `fetchProgress` calls `restore_hearts_if_due` only when `hearts_refill_at` is in the past; a 401 throws `ProgressSyncError.Server(401, message)` with `message` taken from `message`, `msg`, `hint` or `error` keys; `parsePostgresTimestamp("2026-09-20T01:23:45.678901+00:00")` parses.

- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** — port `ProgressSyncClient.swift` method by method. Use `java.time.OffsetDateTime.parse` for timestamps (handles fractional seconds). All JSON via `ContentJson.json`.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): ProgressSyncClient over Ktor with mock-engine tests"`

---

### Task 11: Sync engine (offline drain) port

**Files:**
- Create: `core/src/main/kotlin/.../core/sync/SyncQueue.kt`, `SyncEngine.kt`
- Test: `core/src/test/kotlin/.../core/sync/SyncEngineTest.kt`

**Interfaces:**
- Produces: `data class PendingLessonCompletion(lessonId, total, answers: List<LessonAnswer>, course: String, queuedAt: Long, optimisticXpEstimate: Int)`, `data class PendingReviewGrade(itemKey, answer, course, queuedAt: Long)`, `data class SyncResult(syncedLessonCompletions, syncedReviewGrades, lastKnownProgress: LessonCompletionProgress?)`, `object SyncEngine { suspend fun sync(pendingLessonCompletions, pendingReviewGrades, client: ProgressSyncClient): SyncResult }`.

- [ ] **Step 1: Failing tests (vectors from `SyncEngineTests.swift`)** — completions drain oldest-first and return the last progress; a failed completion is left unsynced and the rest still drain; grades drain strictly oldest-first and stop at the first failure; Review Focus 2: a wrong-answer outcome with `dueOn == today` from `computeReviewOutcome` is asserted to keep the cached item (this is a pure-function assertion in the same test class, so the Room layer in Task 14 has one rule to follow).
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** as a port of `SyncEngine.swift`.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android-core): offline sync engine port"`

---

### Task 12: App shell, theme system, navigation

**Files:**
- Create: `app/src/main/java/.../AlphonsoApplication.kt`, `AppContainer.kt`
- Create: `app/src/main/java/.../ui/theme/AlphonsoTheme.kt`, `AlphonsoPalettes.kt`, `Type.kt`
- Create: `app/src/main/java/.../ui/RootScreen.kt`, `ui/nav/Routes.kt`
- Create: `app/src/main/res/font/*.ttf` (copy the seven variable fonts from `ios/LearnWithAlphonso/Sources/Fonts/`)
- Modify: `MainActivity.kt`

**Interfaces:**
- Produces: `enum class AlphonsoThemeId(val raw: String) { MEADOW("meadow"), STUDIO_INK("studio-ink"), MANUSCRIPT("manuscript"), CANOPY("canopy") }`; `data class AlphonsoPalette(surface, parchment, ink, inkSoft, moss, mossDeep, ember, emberSoft, destructive, hairline, onPrimary, onAccent, onMossGradient, isDark: Boolean, displayFont: FontFamily, sansFont: FontFamily)`; `object AlphonsoPalettes { val light: Map<AlphonsoThemeId, AlphonsoPalette>; val dark: Map<AlphonsoThemeId, AlphonsoPalette> }` with the exact hex values from `AlphonsoTheme.swift` (Meadow surface `0xF5F0E8` ... Canopy dark destructive `0xFF0B16`; copy all four light and three dark tables verbatim); `class ThemeManager(prefs: SharedPreferences)` with `StateFlow<AlphonsoThemeId>`, `setTheme`, `hydrateFromServer(String?)`, default `CANOPY`; `@Composable fun AlphonsoTheme(themeId, systemDark: Boolean, content)` providing `LocalAlphonsoPalette` and a Material 3 `ColorScheme` mapped from it; `AppContainer` holding `ContentStore` (assets loader), `ThemeManager`, `SupabaseHttp` factory, `ProgressSyncClient` factory, and later the session and Room stores.
- Routes: `Learn`, `Listen`, `Practice`, `Hector`, `Profile` bottom tabs; `Lesson/{course}/{lessonId}`, `Review`, `Placement`, `Settings`.

- [ ] **Step 1: Write a palette parity test in `app/src/test`** (plain JVM test with Robolectric not needed: palettes are data) asserting `AlphonsoPalettes.light[CANOPY].moss == Color(0xFF0C6944)` and `AlphonsoPalettes.dark.keys == setOf(MEADOW, MANUSCRIPT, CANOPY)`.
- [ ] **Step 2: Implement** the theme files, `RootScreen` with a `NavigationBar` of five items and a `NavHost`, placeholder screens per tab saying the tab name, `MainActivity` calling `AlphonsoTheme(themeManager.theme.collectAsState(), isSystemInDarkTheme()) { RootScreen(container) }`.
- [ ] **Step 3: Run** `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`, expect success.
- [ ] **Step 4: Commit** — `git commit -m "feat(android): app shell, four-theme design system, tab navigation"`

---

### Task 13: Auth and session

**Files:**
- Create: `app/src/main/java/.../auth/SessionStore.kt`, `SessionManager.kt`, `GoogleSignIn.kt`, `OAuthCallbackActivity.kt`
- Create: `app/src/main/java/.../ui/auth/AuthScreen.kt`
- Modify: `AndroidManifest.xml` (callback activity with intent filter for scheme `com.obsidianmedia.learnwithalphonso`, host `login-callback`)
- Test: `app/src/test/java/.../auth/SessionManagerTest.kt`

**Interfaces:**
- Produces: `data class SupabaseSession(accessToken, refreshToken, expiresAtEpochSeconds: Long, userId: String)`; `interface SessionStore { fun load(): SupabaseSession?; fun save(s); fun clear() }` with `EncryptedSessionStore(context)` using `EncryptedSharedPreferences`; `class SessionManager(auth: Auth /* supabase-kt */, store: SessionStore, clock: () -> Long)` exposing `StateFlow<AuthState>` (`SignedOut`, `AwaitingCode(email)`, `SignedIn(session)`), `suspend fun restore()`, `requestCode(email)`, `verifyCode(email, code)`, `signInWithPassword(email, password)`, `signUpWithPassword(email, password, displayName)`, `resetPassword(email)`, `signInWithGoogle(launch: (Uri) -> Unit)` + `completeOAuth(callbackUri)`, `suspend fun freshAccessToken(force: Boolean = false): String?` (refreshes when within 60 s of expiry; on refresh failure signs out and returns null), `signOut()`.
- The `apikey`/Bearer pair the clients need is `SupabaseHttp(baseUrl, anonKey, accessToken = { sessionManager.currentAccessToken() })`; the 401-retry lives in a Ktor `HttpSend` interceptor in `SupabaseHttp` that calls an injected `refresh: suspend () -> String?` once.

- [ ] **Step 1: Failing tests** — with a fake `Auth` seam (wrap supabase-kt calls behind an `interface AuthGateway` so tests need no network): restore with a valid stored session yields `SignedIn`; restore with an expired session refreshes; restore whose refresh fails clears the store and yields `SignedOut` (Review Focus 4); `freshAccessToken()` refreshes at 59 s to expiry and not at 61 s; `verifyCode` persists the session.
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** — `AuthGateway` impl over supabase-kt `Auth`: `signInWith(OTP) { email = ... }`, `verifyEmailOtp(OtpType.Email.EMAIL, email, token)`, `signInWith(Email)`, `signUpWith(Email) { data = buildJsonObject { put("display_name", name) } }`, `resetPasswordForEmail(email, redirectUrl = "https://learn.alphonsoecosystem.app/reset-password")`, `refreshSession(refreshToken)`, and for Google build the PKCE URL exactly as `GoogleOAuthFlow.swift` does (`auth/v1/authorize?provider=google&redirect_to=...&code_challenge=...&code_challenge_method=s256`) opened with `CustomTabsIntent`, then `exchangeCodeForSession(code, codeVerifier)`. `AuthScreen`: Continue with Google, email field, Send code, code step, plus a "Use a password instead" toggle exposing password sign-in, sign-up with display name (max 40) and forgot-password, and the line "By continuing you agree to our Terms and Privacy Policy" linking to the web URLs.
- [ ] **Step 4: Run unit tests and `assembleDebug`, expect success.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android): session manager, OTP/password/Google auth, encrypted session store"`

---

### Task 14: Room offline store

**Files:**
- Create: `app/src/main/java/.../data/AlphonsoDatabase.kt`, `SyncEntities.kt`, `SyncDao.kt`, `SyncQueueStore.kt`
- Test: `app/src/androidTest/java/.../data/SyncQueueStoreTest.kt` (in-memory Room, runs in the CI emulator)

**Interfaces:**
- Produces: `class SyncQueueStore(dao: SyncDao)` with `suspend fun pendingLessonCompletions(): List<PendingLessonCompletion>`, `appendLessonCompletion`, `removeSyncedLessonCompletions`, `pendingReviewGrades`, `appendReviewGrade`, `removeSyncedReviewGrades`, `lastKnownDueReviews(): List<ReviewItem>`, `replaceLastKnownDueReviews(list)`, `removeCachedDueReview(itemKey)`, `lastKnownProgress(): LessonCompletionProgress?`, `updateLastKnownProgress(p)`, `lastSyncedAt(): Long?`, `markSyncedNow()`, and `Flow<Int>` `dueCount` for the badge. Answers and `choices` are stored as JSON strings via `ContentJson`.

- [ ] **Step 1: Write the instrumentation test** — append two completions, read back ordered by `queuedAt`; remove one; replace due reviews and read count; `updateLastKnownProgress` round-trips `heartsRefillAt = null`.
- [ ] **Step 2: Implement** entities `PendingLessonCompletionRecord`, `PendingReviewGradeRecord`, `CachedDueReviewRecord`, `AppSyncStateRecord(id = 1, lastSyncedAt, progressJson)`, DAO with the queries above, `Room.databaseBuilder(context, AlphonsoDatabase::class.java, "alphonso.db").fallbackToDestructiveMigration(false)`.
- [ ] **Step 3: Run** `.\gradlew.bat :app:assembleDebugAndroidTest` locally (compiles the test); execution happens in Task 20's emulator job.
- [ ] **Step 4: Commit** — `git commit -m "feat(android): Room offline store for sync queue and cached progress"`

---

### Task 15: Learn tab and status header

**Files:**
- Create: `app/src/main/java/.../ui/learn/LearnScreen.kt`, `LearnViewModel.kt`, `StatusHeader.kt`, `CoursePicker.kt`
- Create: `app/src/main/java/.../sync/SyncCoordinator.kt`
- Test: `app/src/test/java/.../ui/learn/LearnViewModelTest.kt`

**Interfaces:**
- Produces: `class SyncCoordinator(store: SyncQueueStore, client: () -> ProgressSyncClient?, connectivity: Flow<Boolean>)` with `suspend fun triggerSync()` that drains via `SyncEngine.sync`, then refreshes `lastKnownProgress` from `fetchProgress()` when nothing was pushed (mirrors `RootView.triggerSync`); `LearnViewModel(content, syncStore, client, course: StateFlow<Course>)` exposing `units` grouped by level, `completedLessonIds`, `progress`, `dueCount`, and `selectLevel`.
- Consumes: `ContentStore`, `SyncQueueStore`, `ProgressSyncClient`, `ReviewBadge`.

- [ ] **Step 1: Failing view-model test** (fake client) — completed ids mark the right lessons; the review row shows `ReviewBadge.text(dueCount)`; switching course changes units.
- [ ] **Step 2: Implement** — `LearnScreen`: `StatusHeader` (streak flame, hearts, XP, league tier from cached progress; nothing when null), `CoursePicker` (`DropdownMenu` with flag + code), level chips, a "Review" row with badge navigating to `Review`, `LazyColumn` of units and lesson rows with a completion dot, `LaunchedEffect` scrolling to the most recently completed lesson. Tapping a lesson navigates to `Lesson/{course}/{id}`.
- [ ] **Step 3: Run tests and `assembleDebug`.**
- [ ] **Step 4: Commit** — `git commit -m "feat(android): Learn tab, status header, sync coordinator"`

---

### Task 16: Lesson player

**Files:**
- Create: `app/src/main/java/.../ui/lesson/LessonViewModel.kt`, `LessonScreen.kt`, `QuestionCard.kt`, `OverviewScreen.kt`, `VocabScreen.kt`, `FinishScreen.kt`, `OfflineFinishScreen.kt`, `ExplanationCard.kt`
- Test: `app/src/test/java/.../ui/lesson/LessonViewModelTest.kt`
- Test: `app/src/androidTest/java/.../ui/lesson/QuestionCardTest.kt`

**Interfaces:**
- Produces: `LessonViewModel(lesson, course, content, client, syncStore, connectivity)` with state `phase` (Overview, Vocab, Quiz, Finished(result), QueuedOffline(pending), Error), `idx`, `picked`, `checked`, `activeReinforcement`, `pendingReinforcement`, `correctCount`, and actions `begin()`, `startPractice()`, `pick(String?)`, `check()`, `continueOrFinish()`, `continueToNextLesson()`. Speak and translate cards render with their typing fallback in this plan; the recorder and AI grading path arrive in Plan 3 behind the same `picked` binding.

- [ ] **Step 1: Failing view-model tests** — answering wrong queues a reinforcement and does not count it toward `answers` (Review Focus 5: after a wrong q2, a reinforcement round, and the remaining questions, `answers.size == lesson.questions.size` and each `questionId` is unique); a wrong answer calls `loseHeart()` once and decrements cached hearts; finishing online calls `startLessonSession` then `completeLesson` with `total == questions.size`; finishing offline queues a `PendingLessonCompletion` with `optimisticXpEstimate == computeXpGain(correct, total)`; `nextLessonId` crosses unit boundaries within a level and is null at the level's end.
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** — port `LessonPlayerView.swift` phase by phase. `QuestionCard` renders: mc choices with selected/correct/incorrect states and content descriptions ("<choice>, your answer, correct" etc.), fill text field plus word bank chips, reorder token pool and assembled row (indices, not values), listening with a Play button using `android.speech.tts.TextToSpeech` in the course locale, translate text field, speak typing fallback with the phrase card. `ExplanationCard` shows Alphonso's tip on a wrong answer. `FinishScreen` shows XP gain, correct/total, hearts bonus text, unlocked achievements, "Continue to next lesson". Set `key(isReinforcing, questionId)` around the card so reorder state resets.
- [ ] **Step 4: Compose test** — mc card marks the tapped choice selected and, after check, labels the correct one.
- [ ] **Step 5: Run unit tests and `assembleDebug`.**
- [ ] **Step 6: Commit** — `git commit -m "feat(android): lesson player with six question types, hearts, offline finish"`

---

### Task 17: Review queue

**Files:**
- Create: `app/src/main/java/.../ui/review/ReviewViewModel.kt`, `ReviewScreen.kt`
- Test: `app/src/test/java/.../ui/review/ReviewViewModelTest.kt`

**Interfaces:**
- Produces: `ReviewViewModel(content, client, syncStore, connectivity, course)` with `queue`, `idx`, `picked`, `checked`, `showingCachedSince`, `clearedBonusMessage`, actions `check()`, `next()`. Weakness-sourced items build a `Question.MultipleChoice` from the row's embedded fields (port of `question(fromWeaknessItem:)`).

- [ ] **Step 1: Failing tests** — online grade calls `gradeReview` then advances; the last item triggers `claimReviewClearBonus`; offline grade queues `PendingReviewGrade` and, for a wrong answer, keeps the item in the cached list (Review Focus 2) while a correct answer with a future `dueOn` removes it; a weakness item with missing fields is skipped, not crashed.
- [ ] **Step 2: Run, expect compile failure.**
- [ ] **Step 3: Implement** — port `ReviewQueueView.swift`; reuse `QuestionCard` from Task 16; `CachedQueueBanner` with relative time via `DateUtils.getRelativeTimeSpanString`.
- [ ] **Step 4: Run tests and `assembleDebug`.**
- [ ] **Step 5: Commit** — `git commit -m "feat(android): review queue with offline optimistic grading"`

---

### Task 18: Placement exam

**Files:**
- Create: `app/src/main/java/.../ui/placement/PlacementViewModel.kt`, `PlacementScreen.kt`
- Test: `app/src/test/java/.../ui/placement/PlacementViewModelTest.kt`

**Interfaces:**
- Produces: `PlacementViewModel(content, client, course, canPlayAudio)` walking bands with `nextAdaptiveBand`, tallying `correctByLevel`, calling `savePlacementResult(course, level, score)` where `score = round(100 * correct / answered)`, exposing `result: PlacementScore?`. Root shows it as a full-screen route once when `fetchPlacementTakenAt("en") == null`; an exit button dismisses without saving.

- [ ] **Step 1: Failing tests** — a perfect A1 band skips A2 and lands on B1 (from `nextAdaptiveBand`); skipped bands receive synthetic pass credit (3 correct); zero on a band stops; result level matches `scorePlacement`.
- [ ] **Step 2: Implement**, reusing mc/listening/translate rendering from `QuestionCard` variants.
- [ ] **Step 3: Run tests and `assembleDebug`.**
- [ ] **Step 4: Commit** — `git commit -m "feat(android): adaptive placement exam"`

---

### Task 19: Settings (theme, account export and delete, sign out)

**Files:**
- Create: `core/src/main/kotlin/.../core/net/AccountClient.kt` (+ test)
- Create: `app/src/main/java/.../ui/settings/SettingsScreen.kt`, `SettingsViewModel.kt`

**Interfaces:**
- Produces: `AccountClient(http)` with `exportMyData(): ByteArray` (POST `api/account-export`) and `deleteMyAccount()` (POST `api/account-delete` with `{"confirm":"DELETE"}`), throwing `AccountError.Server(status, message)`. Settings shows the theme picker (writes `profiles.theme` via `updateProfileTheme`), Export My Data (`ACTION_CREATE_DOCUMENT` with `alphonso-my-data.json`), Delete My Account (dialog requiring typed `DELETE`, with the "does not cancel a subscription" and Apple wording replaced by "does not cancel an active Google Play subscription"), Privacy Policy and Terms links, Sign out. Display name and avatar editing arrive in Plan 2.

- [ ] **Step 1: Failing client test** — export hits the right path with Bearer header; delete sends the literal body; a 401 maps to `AccountError.Server(401, ...)`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run tests and `assembleDebug`.**
- [ ] **Step 4: Commit** — `git commit -m "feat(android): settings with theme sync, data export and account deletion"`

---

### Task 20: Android CI workflow

**Files:**
- Create: `.github/workflows/android-ci.yml`
- Create: `app/src/androidTest/java/.../SmokeTest.kt`

**Interfaces:**
- Produces: a workflow on `push` to `android` and `pull_request` paths `android/**`, `scripts/export-android-content.ts`, `.github/workflows/android-ci.yml`, with jobs: `content` (bun regenerate and `git diff --exit-code`), `unit` (JDK 17, `gradlew :core:test :app:testDebugUnitTest :app:lintDebug`), `build` (`assembleDebug`, upload APK artifact), `emulator` (`reactivecircus/android-emulator-runner` API 34 with KVM on `ubuntu-latest`, `connectedDebugAndroidTest`, uploads screenshots taken by `SmokeTest`).

- [ ] **Step 1: Write the workflow**

```yaml
name: Android CI
on:
  push:
    branches: [android]
    paths: ["android/**", "scripts/export-android-content.ts", ".github/workflows/android-ci.yml"]
  pull_request:
    paths: ["android/**", "scripts/export-android-content.ts", ".github/workflows/android-ci.yml"]
concurrency: { group: android-${{ github.ref }}, cancel-in-progress: true }
jobs:
  content:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: "1.3.10" }
      - run: bun install --frozen-lockfile
      - name: Bundled Android content is up to date
        run: |
          bun scripts/export-android-content.ts
          git diff --exit-code -- android/LearnWithAlphonso/app/src/main/assets || { echo "::error::Run bun scripts/export-android-content.ts and commit."; exit 1; }
  unit:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: android/LearnWithAlphonso } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew :core:test :app:testDebugUnitTest :app:lintDebug --no-daemon
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: android-unit-reports, path: android/LearnWithAlphonso/**/build/reports/ }
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: android/LearnWithAlphonso } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew :app:assembleDebug --no-daemon
      - uses: actions/upload-artifact@v4
        with: { name: app-debug-apk, path: android/LearnWithAlphonso/app/build/outputs/apk/debug/app-debug.apk }
  emulator:
    runs-on: ubuntu-latest
    needs: [unit]
    steps:
      - uses: actions/checkout@v4
      - name: Enable KVM
        run: echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules && sudo udevadm control --reload-rules && sudo udevadm trigger --name-match=kvm
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "17" }
      - uses: gradle/actions/setup-gradle@v4
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          target: google_apis
          working-directory: android/LearnWithAlphonso
          script: ./gradlew connectedDebugAndroidTest --no-daemon
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: android-instrumentation-reports, path: android/LearnWithAlphonso/app/build/reports/androidTests/ }
```

- [ ] **Step 2: Write `SmokeTest`** — launches `MainActivity`, asserts the sign-in screen shows "Continue with Google", takes a screenshot into the test's external files dir.
- [ ] **Step 3: Push the branch and watch the run**

Run: `git push -u origin android` then `gh run watch --exit-status` on the latest run for the workflow.
Expected: all four jobs green. Fix any red job before continuing; a red `emulator` job caused by KVM availability is worked around with `emulator-options: -no-snapshot -no-window -gpu swiftshader_indirect`.

- [ ] **Step 4: Commit and push fixes** — `git commit -m "ci(android): unit, build and emulator jobs"`

---

### Task 21: Documentation

**Files:**
- Create: `android/LearnWithAlphonso/README.md`
- Modify (android branch only): `ARCHITECTURE.md` (new "Native Android app" section), `AGENTS.md` (Key Files rows for `android/`), `CHANGELOG.md` (V5 entry), `README.md` (platform line)

- [ ] **Step 1: Write the Android README** — modules, how to build, what is CI-only, which plan each feature area lands in, the secrets list from spec section 11 marked "not yet needed".
- [ ] **Step 2: Update the shared docs** in the same style the iOS sections use; keep the "Android intentionally not started" backlog statement for the owner to update since `docs/BACKLOG.md` is gitignored.
- [ ] **Step 3: Commit** — `git commit -m "docs: Android app plan 1 documentation"`

---

## Self-review

- Spec coverage for Plan 1's slice: sections 1 to 6 and the auth, learning loop, offline, hearts, placement, settings rows of section 4 map to Tasks 3 to 19; section 10 CI to Task 20; section 5 content to Task 2. Social, audio, podcasts, push, subscription, widget and release are explicitly deferred to Plans 2 to 5 as the spec's scope check requires.
- Placeholders: none; every test step names its vectors or the TS file they are copied from verbatim.
- Type consistency: `LessonAnswer`, `LessonCompletionProgress`, `ReviewItem`, `PendingLessonCompletion`, `PendingReviewGrade`, `SyncResult`, `Course`, `Question` cases are defined once (Tasks 3, 10, 11) and consumed by name in Tasks 14 to 18.
- Review Focus: item 1 in Task 3, item 2 in Tasks 11 and 17, item 3 in Task 6, item 4 in Task 13, item 5 in Task 16.
