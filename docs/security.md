# Security practices

How the app keeps accounts, data and the build pipeline safe, and where each practice is checked. Each item names
the guard test that fails if the practice is removed. Report a suspected problem privately to the owner, not in an
issue.

## Sign-in and sessions

- **Sign-out ends the session on the server.** iOS and Android call the auth server's logout (`scope=local`) with the
  ending session's token after clearing local state (`AuthAccountCleanup.swift`, `SessionManager.kt`). Account
  deletion and data export also confirm the session with the auth server first (`src/lib/live-session.server.ts`).
- **Sessions stay on the device.** The iOS session is a this-device-only Keychain item, and the first launch after a
  reinstall clears any session left by a previous install, while an app update keeps it (`FreshInstallGuard.swift`,
  `KeychainSessionStore.swift`). Android excludes app data from
  cloud backup and device transfer (`res/xml/data_extraction_rules.xml`) and resets a session file it cannot decrypt.
  Guards: `src/lib/ios-session-guards.test.ts`, `src/lib/android-data-guards.test.ts`.
- **New passwords need 10 characters** on the web and Android (`src/lib/password-policy.ts`, `PasswordPolicy.kt`).
  Existing shorter passwords still sign in. The auth server's own minimum is a dashboard setting;
  `scripts/check-auth-config.ts` prints a warning while it is lower.
- **Captcha.** With `VITE_TURNSTILE_SITE_KEY` set (it is set on the web project in Vercel production), the web email
  forms send a Cloudflare Turnstile token (`src/lib/turnstile.ts`), and iOS and Android show the same check on their
  email sign-in screens (`BotCheckView.swift`, `BotCheckWebView.kt`). The auth server's own captcha switch applies to
  every client; `scripts/check-auth-config.ts` prints a warning in the deploy log while `security_captcha_enabled` is
  off. (unverified: the live auth setting needs the Supabase access token, which was not available for this pass.)
- **Leaked-password protection** is a dashboard setting on the Supabase project. The security advisor on production
  raises no leaked-password finding (checked 2026-11-22), which is consistent with it being on; the repo cannot
  assert it (`auth-config-guard.ts` does not read it).
- **Admin second factor.** By default (fail closed; only `ADMIN_REQUIRE_AAL2=false` opts out), every staff server function requires a session verified
  with an authenticator code (`requireStaff`, which replaced `requireAdmin` in #496; `src/lib/admin-auth.ts`). The
  admin sign-in page enrols and verifies the authenticator. `ADMIN_REQUIRE_AAL2` is set on the admin Vercel project.
- **Staff roles, scopes and the action record (#496).** Staff are `owner` or `support` with named scopes
  (`src/lib/staff-scopes.ts`); the server checks the scope in every function and a registry test fails if one skips
  `requireStaff`. Every staff change is written with a required reason to the append-only `staff_audit_log` in the same
  transaction as the change (a trigger refuses UPDATE, DELETE and TRUNCATE). Staff tables have no client privileges.
  Staff management is owner-only and never on one's own row. See `docs/privacy-and-data.md`.
- **The rebuilt admin console (#684-#703).** All eleven screens are on the new shell and every admin route is under
  `src/lib/console-no-hardcoded-data.test.ts` (`LEGACY_ROUTES` is empty): a number reaches the screen only through
  `<Figure value reason>`, and no sample, mock-up row or hard-coded figure may be in a console source. The database
  enforces the staff rules itself, so a caller that skipped the console is still refused:
  - every `staff_*` function is `SECURITY DEFINER` with an empty `search_path` and `EXECUTE` for `service_role` only
    (probed 2026-11-22: none for `anon` or `authenticated`);
  - every sensitive action takes a reason of 3 to 500 characters that is checked **in SQL, before anything changes**
    (SQLSTATE `22023` otherwise, nothing written, nothing recorded) and is written to `staff_audit_log` in the same
    transaction: report actions (`staff_dismiss_report`, `staff_reset_display_name`, `staff_rename_team`,
    `staff_disband_team`, #697), support status, assignment, hand-over to an owner and clearing the urgent flag
    (`staff_support_set_status`, `_assign`, `_hand_to_owner`, `_clear_urgent`, #683), the nine podcast and folder writes
    (`staff_podcast_*`, #703), settings (`staff_set_setting`), restrictions, Pro grants and staff changes;
  - the actor's role is checked in SQL, not trusted from the console: `staff_add_member` and `staff_update_member`
    need an active owner in the database, and a change that would leave no active owner is refused (last-owner guard,
    `20261127140000`);
  - staff rate limits are counted in the database (`consume_staff_rate_limit`, `staff_rate_limits`), so a new server
    instance does not reset a window.
- **Ban and block (#496).** A ban refuses the learner's token in the web middleware and in the seven learner Edge
  Functions (`complete-lesson`, `complete-podcast-quiz`, `complete-story-check`, `finish-branching-story`,
  `get-season-status`, `grade-review`, `start-lesson-session`; `account_suspended`), revokes sessions and sets the Auth
  ban. A block hides and refuses social surfaces;
  `social-surfaces.ts` lists every RPC and policy where learners meet and a test executes each.

## Lessons

- **Lessons start only when unlocked (#688).** `start-lesson-session` (Edge) and the web server function decide from the
  learner's own completions and stored CEFR level, never from anything the client sends
  (`supabase/functions/_shared/lesson-unlock.ts`, `src/lib/lesson-unlock.server.ts`; rule in `src/lib/lesson-unlock.ts`).
  A failed read lets the learner in and is logged.
- **A lesson-session token completes a lesson once.** `lesson_session_redemptions` and `apply_lesson_completion_once`
  (`20261125110000`) record each token by its SHA-256, so a replay returns the stored result and writes nothing; hearts
  are settled once per token. Rows older than 7 days are pruned by the maintenance sweep.
- **A Hector turn token speaks one reply, at most twice per part (#717).** `/api/tts?turn=<token>&part=<n>` verifies an HMAC over `hector-turn:v1|userId|sha256(text)|expiry` (key `LESSON_SESSION_SECRET`, 2 minute window, `src/lib/hector-turn-token.server.ts`): another user, another text, an expired token or a lesson-session or recap token is refused (403 `turn-invalid`). Because the token is stateless, uses are counted in `hector_turn_token_uses` through `consume_hector_turn_use` (service role only); the third use of a (token, part) is 429 `turn-replay-limit` and an unreadable count is 503 `turn-unavailable` (fail closed, it is paid speech); the client then uses the device voice. The route still runs the auth, AI-switch and consent gates; only the second quota charge is skipped. Rows past expiry are pruned by the maintenance sweep.

## Push notifications

`send-push` accepts the database trigger's call only with `SEND_PUSH_SECRET` (a Vault secret read by the trigger and a
Supabase function secret synced by `deploy-supabase`) or, until that secret exists, the older service-role header
(`supabase/functions/send-push/auth.ts`). `SEND_PUSH_SECRET` is not among the repository's GitHub secrets as of
2026-11-22, so the older header is still the one in use; the owner creates the secret to switch over.

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
  git-ignored. Dependency advisories are checked on every PR, and Dependabot opens security updates only.
- Guard: `src/lib/ci-hardening-guards.test.ts` (run with `GUARD_ROOT=<dir>` to check another tree).
