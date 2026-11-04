# Sentry crash and error reporting

Org `obsidian-media`, three projects: `learnwithalphonso-web`, `-ios`, `-android`. Added 2026-11-04.
PostHog product analytics is a separate, later piece of work.

## What each platform does

| | Where | On when | DSN |
| --- | --- | --- | --- |
| Web client | `src/lib/sentry-client.ts` (started from `getRouter` in `src/router.tsx`; fed by `reportError` in `src/lib/error-reporting.ts`) | production browser build | `src/lib/sentry-config.ts` |
| Web server | `src/lib/sentry-server.ts`, called from `src/start.ts` and `src/server.ts` | `NODE_ENV=production` | same |
| iOS | `ios/LearnWithAlphonso/Sources/CrashReporting.swift`, first line of the app's `init` | Release builds (`#if DEBUG` returns) | in that file |
| Android | `android/.../CrashReporting.kt`, from `AlphonsoApplication.onCreate` | non-debug builds | in that file |

The DSNs are the public client DSNs (they can only submit events), so they are committed. Never commit an auth token.
`VITE_SENTRY_DSN` / `SENTRY_DSN` can override the web DSN; empty or non-production means off.

## Privacy contract (pinned by tests)

- No default PII, no user identity, no Session Replay, no screenshots or view hierarchy, no tracing (rate 0), no sessions.
- Web: `beforeSend` and `beforeBreadcrumb` (`src/lib/sentry-scrub.ts`) remove emails, JWTs, bearer tokens, sensitive URL
  parameters, request headers, cookies and bodies; console breadcrumbs are dropped.
  Tests: `sentry-scrub.test.ts`, `sentry-wiring.test.ts` (fail if the scrubber is removed or replay/PII turned on).
- iOS: `src/lib/ios-crash-reporting-guards.test.ts` (start call, release-only, DSN, PII/replay/screenshot off, SDK pin) and
  `ios-privacy-manifest.test.ts` (Crash Data, not linked, not tracking, App Functionality).
- Android: `CrashReportingTest` (JVM): the same settings and scrubbing.
- CSP: the Sentry ingest origin is in `connect-src` (`src/lib/security-policy.ts`).
- Versions pinned: `@sentry/react` 10.76.2, sentry-cocoa 9.30.2 (`project.yml`), sentry-android 8.61.0 (`libs.versions.toml`).

## Owner steps (not done by the agent)

1. Sentry project settings, each of the three projects: turn on Security and Privacy, Data Scrubber and Prevent Storing of
   IP Addresses; keep Replay off.
2. Create an organization auth token (scopes `project:releases`, `org:read`, `project:write`) and store it as the GitHub
   secret `SENTRY_AUTH_TOKEN`. Then enable the disabled upload steps below.
3. App Store Connect App Privacy and Play data safety answers: see the PR that added this file.

## Disabled until the auth token exists

Documented, not wired, because they need `SENTRY_AUTH_TOKEN`:

- Web source maps: add `@sentry/vite-plugin` to `vite.config.ts` (`org: obsidian-media`, `project: learnwithalphonso-web`,
  `authToken: process.env.SENTRY_AUTH_TOKEN`, `sourcemaps.filesToDeleteAfterUpload`) and set `build.sourcemap: "hidden"`.
- iOS dSYMs: a step in `.github/workflows/ios-release.yml` after archive, `sentry-cli debug-files upload --org obsidian-media
  --project learnwithalphonso-ios <path to .xcarchive/dSYMs>`.
- Android mapping file: the `io.sentry.android.gradle` plugin, or `sentry-cli upload-proguard` with
  `app/build/outputs/mapping/release/mapping.txt`, in `android-release.yml`.

Until then web, iOS and Android stack traces are symbol-less; the reports still carry the error, device and app version.
