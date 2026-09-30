# Android Plan 5: Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed, validated release bundle from one manual workflow dispatch with an optional Google Play upload, the Play listing material, the device checklist that gates the first upload, App Links verification for invite links, and the store screenshots captured on the CI emulator.

**Architecture:** `android-release.yml` mirrors `ios-release.yml`: refuse without the signing secrets, decode the upload keystore to a temp file, build `bundleRelease` with the production RevenueCat key and the run number as `versionCode`, inspect the produced `.aab` with bundletool (package, versionCode, not debuggable, the media service's foreground type, signature present), then upload through the Play Developer API when asked. Signing config in `app/build.gradle.kts` exists only when `ANDROID_UPLOAD_KEYSTORE_PATH` points at a file. Listing copy, data-safety answers and review notes live under `android/LearnWithAlphonso/play/`; `DEVICE-CHECKLIST.md` lists what CI cannot prove. `ScreenshotTest` (androidTest) captures the shot list when the workflow passes a minted demo session and is skipped otherwise. `public/.well-known/assetlinks.json` on the web app carries the upload key's SHA-256.

**Tech Stack:** Plans 1 to 4, bundletool 1.18.1 (downloaded in the workflow), `r0adkll/upload-google-play@v1`, `androidx.test.runner` `Screenshot` (already a dependency), `scripts/mint-demo-session.ts` (existing).

**Spec:** `docs/superpowers/specs/2026-09-29-android-app-design.md` sections 10 (CI), 11 (release), 12 (risks: the device checklist gates the release workflow).

**Depends on:** Plans 1 to 4 on `android`; owner items 5 to 11 in `OWNER-SETUP.md` for anything past the artifact.

## Global Constraints

- Nothing signing-related is ever committed: the keystore arrives base64 in a secret and is deleted at the end of the run even on failure; `*.jks`, `*.keystore` and `app/google-services.json` are git-ignored.
- A release task refuses an empty or `test_` RevenueCat key (Gradle, from Plan 3) and the workflow refuses to start without the four keystore secrets and the key.
- `versionCode` is `github.run_number` on the release workflow and 1 everywhere else; `versionName` stays `1.0` until the owner bumps it.
- The first bundle is uploaded by hand in Play Console (Google creates the app record from it); the upload step is opt-in per dispatch and requires `PLAY_SERVICE_ACCOUNT_JSON`.
- The listing copy makes the same claims as the App Store copy and nothing more; data-safety rows are the eight App Store categories mapped onto Play's taxonomy, plus the FCM token under Device IDs.
- The device checklist is signed off by the owner before the first Play upload; the workflow itself cannot check that, so the README says so.
- `assetlinks.json` is published only once the owner sends the upload key's SHA-256; until then the invite link opens in the browser and the Friends screen accepts a pasted code.

## Review Focus

1. A run with the secrets present but a `test_` key must fail before building (workflow guard).
2. A bundle whose manifest says `debuggable="true"` or lacks `foregroundServiceType="mediaPlayback"` must fail validation even though Gradle succeeded.
3. `ScreenshotTest` with no instrumentation arguments must be skipped (assumption), never failed, so the ordinary emulator job stays green.
4. The keystore temp file must be removed on every exit path (`if: always()`).
5. `assetlinks.json` must name the upload certificate's fingerprint in the exact `SHA256:` colon-separated uppercase form Android expects, and the package name must match the manifest.

---

### Task 1: Signing config and release workflow

**Files:**
- Modify: `app/build.gradle.kts` (`signingConfigs.upload` from env, `versionCode` from env)
- Create: `.github/workflows/android-release.yml`

- [ ] Add the signing config that exists only when `ANDROID_UPLOAD_KEYSTORE_PATH` names a file; wire it to `release`.
- [ ] Write the workflow: secret guard, keystore decode, optional Firebase config, `:core:test :app:testReleaseUnitTest :app:bundleRelease`, bundletool validation, optional upload, cleanup, artifact.
- [ ] Verify locally that `assembleDebug` still builds without any of the env vars (the config must be absent, not broken).
- [ ] Commit `feat(android): release workflow and upload signing config`.

### Task 2: Play listing material and the device checklist

**Files:**
- Create: `android/LearnWithAlphonso/play/listing.md`, `data-safety.md`, `review-notes.md`, `screenshots.md`, `android/LearnWithAlphonso/DEVICE-CHECKLIST.md`

- [ ] Adapt the App Store description to Play's limits; derive data-safety rows from `PrivacyInfo.xcprivacy`; adapt review notes to Play's App access form (demo email stays in the secret, never in the file).
- [ ] Write the checklist with one line per behaviour CI cannot prove, grouped by plan.
- [ ] Commit `docs(android): Play listing, data safety, review notes, device checklist`.

### Task 3: Screenshot capture

**Files:**
- Create: `app/src/androidTest/java/.../ScreenshotTest.kt`
- Modify: `.github/workflows/android-release.yml` (a `screenshots` job: mint the demo session with `scripts/mint-demo-session.ts`, run the test with `-Pandroid.testInstrumentationRunnerArguments.uiTestAccessToken=...`, pull `/sdcard/Android/data/com.obsidianmedia.learnwithalphonso/files/screenshots`, upload as `android-screenshots`)

- [ ] The test seeds `EncryptedSessionStore` from instrumentation arguments and is skipped when they are absent.
- [ ] Verify the ordinary `android-ci.yml` emulator job still passes (the test is skipped there).
- [ ] Commit `feat(android): store screenshot capture on the emulator`.

### Task 4: App Links

**Files:**
- Create: `public/.well-known/assetlinks.json` (web app, deployed by Vercel from `main`; this lands on `main` as its own tiny PR once the fingerprint exists)

- [ ] Wait for the owner's `SHA256:` line; write the file with `delegate_permission/common.handle_all_urls`, package `com.obsidianmedia.learnwithalphonso`, the fingerprint; PR to `main`.
- [ ] Verify with `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://learn.alphonsoecosystem.app&relation=delegate_permission/common.handle_all_urls` after deploy.

### Task 5: Docs

- [ ] README plan table row 5, secrets section complete, "before the first upload" section pointing at the checklist; `AGENTS.md` rows for `android-release.yml`, `play/`, `DEVICE-CHECKLIST.md`; `ARCHITECTURE.md` release paragraph; `CHANGELOG.md`.
- [ ] Commit, merge `origin/main`, push, watch `android-ci.yml`.
