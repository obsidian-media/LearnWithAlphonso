# Security practices

How the app keeps accounts, data and the build pipeline safe, and where each practice is checked. Each item names
the guard test that fails if the practice is removed. Report a suspected problem privately to the owner, not in an
issue.

## Sign-in and sessions

- **Sign-out ends the session on the server.** iOS and Android call the auth server's logout (`scope=local`) with the
  ending session's token after clearing local state (`AuthAccountCleanup.swift`, `SessionManager.kt`). Account
  deletion and data export also confirm the session with the auth server first (`src/lib/live-session.server.ts`).
- **Sessions stay on the device.** The iOS session is a this-device-only Keychain item, and the first launch after a
  reinstall clears any session left by a previous install (`FreshInstallGuard.swift`). Android excludes app data from
  cloud backup and device transfer (`res/xml/data_extraction_rules.xml`) and resets a session file it cannot decrypt.
  Guards: `src/lib/ios-session-guards.test.ts`, `src/lib/android-data-guards.test.ts`.
- **New passwords need 10 characters** on the web and Android (`src/lib/password-policy.ts`, `PasswordPolicy.kt`).
  Existing shorter passwords still sign in. The auth server's own minimum is a dashboard setting;
  `scripts/check-auth-config.ts` prints a warning while it is lower.
- **Captcha (web, optional).** With `VITE_TURNSTILE_SITE_KEY` set, the web email forms send a Cloudflare Turnstile
  token (`src/lib/turnstile.ts`). The auth server setting is switched on only once the native apps can pass a captcha
  too, because it applies to every client.
- **Admin second factor.** With `ADMIN_REQUIRE_AAL2=true`, every admin server function requires a session verified
  with an authenticator code (`requireAdmin`, `src/lib/admin-auth.ts`). The admin sign-in page enrols and verifies
  the authenticator.

## Paid features and AI

- **Pro counts only real-store purchases.** RevenueCat's Test Store never grants Pro on the server; sandbox purchases
  are refused when `REVENUECAT_REJECT_SANDBOX=true`; named tester accounts can be allowed with
  `REVENUECAT_TEST_PURCHASE_USER_IDS` (`src/lib/revenuecat-entitlement.ts`).
- **AI requests are bounded.** Speech-to-text audio is capped at 1 MB, chat transcripts at 40 turns and 16,000
  characters, weakness analysis has a token ceiling, text-to-speech accepts only the app's own voices, and every
  route that reaches a paid provider honours the AI switch (`src/lib/ai-call-sites.test.ts`).

## Database

- **New functions are closed by default.** Functions created by `postgres` in `public` are not executable by `anon`
  or `authenticated` until a migration grants it; `src/lib/migration-grants.ts` fails CI for a new function with
  neither a revoke nor a deliberate grant. See `docs/database-privileges.md`.
- **Client writes are limited** to the columns a client needs, with length checks and per-hour caps on nudges,
  reports and play events (`20261105100100_client_write_limits.sql`). Retention for usage, nudge, activity and
  play-event rows runs in the maintenance sweep.
- **Errors sent to the browser are stable codes.** Learner-facing server functions log database errors on the server
  and send a code such as `request-failed` (`src/lib/public-error.ts`).
- **Stored Apple tokens are sealed** with AES-256-GCM when `APPLE_TOKEN_ENCRYPTION_KEY` is set
  (`src/lib/token-sealing.server.ts`).
- **The data export** includes every account-owned table and the sign-in record (`account.functions.ts`).

## Build pipeline

- Every workflow states read-only token permissions; jobs holding production credentials run in a named GitHub
  environment; every action is pinned to a commit.
- Workflows run repository scripts with `bun` from the lockfile, never `bunx tsx`. XcodeGen, bundletool, the Gradle
  distribution and the Swift packages are checked against pinned hashes.
- The Android keystore is removed right after signing; binary artifacts are kept one day; signing files are
  git-ignored. A dependency audit runs on every PR, and Dependabot opens security updates only.
- Guard: `src/lib/ci-hardening-guards.test.ts` (run with `GUARD_ROOT=<dir>` to check another tree).
