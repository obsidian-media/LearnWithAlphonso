# Environment & configuration reference

Every environment variable the project reads, grouped by **where it is set**. Values live only in the
dashboards (Vercel / Supabase / GitHub) and are never committed here.

Production addresses: web `https://learnwithalphonso.com`, admin `https://admin.learnwithalphonso.com`, Supabase
custom domain `https://api.learnwithalphonso.com` (so production `SUPABASE_URL` / `VITE_SUPABASE_URL` are that URL;
`.env.example` says the same, and the browser session key is pinned so the URL change signed nobody out). The old
`learn.` / `admin.alphonsoecosystem.app` hosts still answer 200. The marketing site stays on
`discover.alphonsoecosystem.app`. (unverified: the actual Vercel env values were not read here, only the code and
`.env.example`.)

Surfaces:

- **Vercel — web** project (`learnwithalphonso`): the learner site + its `/api/*` server routes.
- **Vercel — admin** project (`learnwithalphonso-admin`): same repo, separate routes (`admin/`), **own env**.
- **Supabase — Edge Function secrets**: Deno functions. `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase; the rest are set by hand or by CI.
- **Supabase — Vault** (database secrets, not env): read by DB triggers.
- **GitHub Actions secrets**: build + deploy + mobile signing.

`R` = required (loud failure if missing). `O` = optional / has a default. **⚠ silent** = no error is raised when
unset — it just quietly does the wrong/weaker thing (the class of bug that hid the RevenueCat gap). Check those
first.

---

## Vercel — web (`learnwithalphonso`)

| Var | R/O | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | R | DB/auth; throw on boot if missing |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | R (build) | browser bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | R (secret) | privileged server ops |
| `OPENROUTER_API_KEY` | R (secret) | chat / Hector; 500 "not configured" otherwise |
| `DEEPGRAM_API_KEY` | R (secret) | TTS/STT voice; 500 otherwise |
| `LESSON_SESSION_SECRET` | R (secret) | signs lesson-session token; **must equal the Supabase function secret**. Also the HMAC key of the call-recap token and, since #717, of the Hector turn token (`hector-turn:v1|` domain prefix, `src/lib/hector-turn-token.server.ts`); with it unset `/api/hector-respond` falls back to inline audio, so the split-turn path needs no new variable |
| `RESEND_API_KEY` | R (secret) | all outgoing email |
| `REPORT_NOTIFY_SECRET` | R (secret, 32+) | `/api/internal/*`; **must equal Vault `report_notify_secret`** |
| `REPORT_NOTIFY_TO` | R | report-email recipient |
| `REVENUECAT_SECRET_API_KEY` | R (secret) | Pro entitlement (v1 API); Pro fails closed otherwise |
| `REVENUECAT_V2_SECRET_KEY` + `REVENUECAT_PROJECT_ID` | **⚠ R** | paywall **price** (v2 API). Both or neither. Missing → offering `unavailable`, no price/checkout. `PROJECT_ID` is accepted with or without the `proj` prefix (`945111ee` or `proj945111ee`; `normalizeProjectId`, #713) |
| `REVENUECAT_WEB_PRODUCT_ID`, `_PURCHASE_LINK`, `_PURCHASE_LINK_NO_TRIAL` | R | monthly web plan; any missing → 503 `not-configured`. The product id may be RevenueCat's `prod...` id or the store identifier (matched on `store_identifier`), and the v2 product list follows `next_page` (#713, `src/lib/web-offering.server.ts`). Every failing step logs `[web-offering]` / `[pro-offering]` with a reason code (no secrets); the 503 body carries `reason` |
| `REVENUECAT_WEB_YEARLY_PRODUCT_ID`, `_PURCHASE_LINK`, `_PURCHASE_LINK_NO_TRIAL` | **⚠ O** | yearly plan; all three or none — silently omitted if partial |
| `SUBSCRIPTION_ID_SECRET` | **⚠ O** (32+) | separate subscription id; **silently ignored under 32 chars**; same value in Supabase secrets; never change once set |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID` | **⚠ O** | Sign-in-with-Apple token revocation; any missing → revocation **skipped silently** |
| `APPLE_TOKEN_ENCRYPTION_KEY` | **⚠ O** (32-byte b64) | seals stored Apple tokens; unset → stored unsealed |
| `REVENUECAT_TEST_PURCHASE_USER_IDS`, `REVENUECAT_REJECT_SANDBOX` | O | sandbox-purchase handling (`REJECT_SANDBOX` must be the string `"true"`) |
| `REVIEW_DEMO_CODE_KEY`, `DEMO_ACCOUNT_EMAIL` | O | App-Review demo-code endpoint; 404 otherwise |
| `APP_MIN_IOS_BUILD`, `APP_MIN_ANDROID_VERSION_CODE`, `APP_IOS_STORE_URL`, `APP_ANDROID_STORE_URL` | O | force-update gate; off when unset |
| `STT_DAILY_AUDIO_SECONDS` (1200), `STT_MAX_CALL_SECONDS` (120) | O | voice limits |
| `LLM_CHAT_MODELS`, `LLM_PROVIDERS` | O | model routing (defaults to Anthropic) |
| `ENFORCE_HEARTS_GATE`, `SERVER_HEARTS` | O | hearts enforcement (on by default) |
| `AI_SPEND_BREAKER_DAILY_USD` (default 100), `AI_SPEND_BREAKER_ENABLED` | O | switches AI off and emails the owner when today's spend reaches it; reset in operations.md |
| `AI_COST_ALERT_DAILY_TOTAL_USD`, `AI_COST_ALERT_DAILY_USER_USD`, `AI_COST_USD_PER_CAD`, `AI_COST_HEAVY_PRICE_CAD`, `AI_COST_HEAVY_SHARE` | O | cost dashboard/alerts |
| `AI_MONTHLY_CAP_FREE_USD`, `AI_MONTHLY_CAP_PRO_USD`, `AI_MONTHLY_CAP_WARN_PERCENT`, `AI_MONTHLY_CAP_ENABLED` | O | per-learner monthly AI-cost cap (defaults in `ai-monthly-cap.ts`) |
| `REPORT_NOTIFY_FROM`, `SUPPORT_NOTIFY_FROM` | O | email "from" addresses, sent through Resend (`RESEND_API_KEY`). Code defaults are `Alphonso Reports <reports@hello.learnwithalphonso.com>` (`report-notify.server.ts`) and `Learn with Alphonso Support team <support@hello.learnwithalphonso.com>` (`support-notify.server.ts`); the cost-alert and ops-alert sweeps have **no** default for `SUPPORT_NOTIFY_FROM` and skip the email with a log line when it is unset. Both variables are SET on the Vercel web Production environment (coordinator read-back 2026-11-22, names only; not re-readable from the agent API, which answers 403). The admin project does not read them |
| `TRIAL_REMINDER_ENABLED`, `TRIAL_REMINDER_FROM` | O | trial-ending reminder email (OPEN-ITEMS 94). **Off unless `TRIAL_REMINDER_ENABLED` is exactly `true`.** Sender defaults to `SUPPORT_NOTIFY_FROM`; `TRIAL_REMINDER_FROM` overrides. Runs inside `/api/internal/maintenance` |
| `SENTRY_DSN`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_TURNSTILE_SITE_KEY` | O | monitoring / analytics / captcha |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | O (build) | source-map upload in `vite.config.ts`; all three or the plugin is off |

---

## Vercel — admin (`learnwithalphonso-admin`)

Same `src/lib`, so it needs the **same Supabase set** as web: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all R, throw if missing).

Admin-specific:

| Var | R/O | Purpose |
|---|---|---|
| `ADMIN_REQUIRE_AAL2` | optional | admin second factor. **Required by default (fail closed):** only the exact string `"false"` turns it off (`admin-auth.ts`: `if (requireAal2 === "false") return true`); unset, empty or any other value requires an authenticator code. Never set `"false"` in production |
| `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_V2_SECRET_KEY`, `REVENUECAT_PROJECT_ID` | R (for staff Pro view) | staff-users Pro column + web-sub cancel |
| `AI_COST_*` | O | cost tiles. The admin project sends no email: `RESEND_API_KEY`, `REPORT_NOTIFY_*` and `SUPPORT_NOTIFY_FROM` are read only by the web project's `/api/internal/*` routes and sweeps (nothing under `admin/` imports `report-notify.server` or `support-notify.server`) |

Numbers-dashboard tiles (`numbers-sources.server.ts`) — each tile shows "Not connected" if its vars are unset (all O). On the admin Vercel project (names read back 2026-11-22 by the coordinator) only the RevenueCat tile is connected; PostHog, App Store Connect and Google Play settings are NOT set (open item in `docs/OPEN-ITEMS.md`):

| Tile | Vars |
|---|---|
| App Store Connect | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`, `ASC_VENDOR_NUMBER` (opt `ASC_APP_ID`) |
| Google Play | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_PLAY_REPORTS_BUCKET` |
| RevenueCat metrics | `REVENUECAT_METRICS_KEY` (+ `REVENUECAT_PROJECT_ID`) |
| Sentry | `SENTRY_API_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECTS` (opt `SENTRY_HOST`) |
| PostHog | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` (opt `POSTHOG_HOST`) |

---

## Supabase — Edge Function secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Functions:
`complete-lesson`, `start-lesson-session`, `grade-review`, `send-push`, `get-season-status`, `complete-podcast-quiz`, `complete-story-check`, `finish-branching-story`.

| Var | R/O | Notes |
|---|---|---|
| `LESSON_SESSION_SECRET` | R | **same value as Vercel web**; CI syncs it |
| `REVENUECAT_SECRET_API_KEY` | **⚠ set by hand (CI does NOT)** | `hearts-pro.ts` server Pro check — unset = everyone treated free |
| `SUBSCRIPTION_ID_SECRET` | **⚠ set by hand** | same value as Vercel |
| `OPENROUTER_API_KEY` (opt `LLM_CHAT_MODELS`, `LLM_PROVIDERS`) | **⚠ set by hand (CI does NOT)** | translation grading |
| `SEND_PUSH_SECRET` | O | CI sets if non-empty |
| `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` (opt `APNS_HOST`) | O | iOS push — any missing = push no-op |
| `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID` | O | Android push — both needed |
| `ENFORCE_HEARTS_GATE`, `SERVER_HEARTS` | O | default on |

## Supabase — Vault (database secrets)

| Name | Notes |
|---|---|
| `report_notify_secret` | **must equal Vercel `REPORT_NOTIFY_SECRET`** — a mismatch gives a silent 401 on `/api/internal/*` |
| `push_trigger_service_key` | DB push triggers |
| `send_push_secret` | optional: the push trigger sends it as `X-Send-Push-Secret` only when Vault holds one (migration `20261105100600`). Production Vault holds only `push_trigger_service_key` and `report_notify_secret` (checked by SELECT on `vault.secrets`, names only) |

DB triggers (the `maintenance-sweep` pg_cron job, the report and support triggers) still call the old host
`learn.alphonsoecosystem.app/api/internal/{report-notify,support-notify,maintenance}` (hard-coded in migrations such as
`20261117100300_support_notifications.sql` and `20261127170000_admin_health_screen.sql`) and `functions/v1/send-push`.
The old host still answers; it must keep serving until a migration repoints these URLs.

---

## GitHub Actions secrets (build / deploy / mobile)

- **Deploy & CI:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `LESSON_SESSION_SECRET`, `SEND_PUSH_SECRET`, `APNS_*`, `FCM_*`, `TYPES_REGEN_DEPLOY_KEY`, `VERCEL_TOKEN` (see
  below).
- **iOS:** `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8_BASE64`,
  `IOS_DIST_CERTIFICATE_P12_BASE64`, `IOS_DIST_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`,
  `IOS_PROVISIONING_PROFILE_UUID`, `IOS_WIDGET_PROVISIONING_PROFILE_BASE64`, `IOS_WIDGET_PROVISIONING_PROFILE_UUID`,
  `APPLE_TEAM_ID`, **`REVENUECAT_API_KEY` (iOS Apple public key — must NOT start with `test_`, or the Release build crashes)**,
  `POSTHOG_PROJECT_KEY`, `FIREBASE_GOOGLE_SERVICES_JSON`.
- **Android:** **`REVENUECAT_ANDROID_PUBLIC_KEY` (Release build hard-fails if blank or `test_`)**,
  `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`,
  `ANDROID_UPLOAD_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`, `FIREBASE_GOOGLE_SERVICES_JSON`.
- **Ops workflows:** `DEMO_ACCOUNT_EMAIL`, `REVENUECAT_SECRET_API_KEY`, `REVIEW_CONTACT_EMAIL`,
  `REVIEW_CONTACT_PHONE`, `REVIEW_DEMO_CODE_URL`, `REVIEW_RECORDING_URL`, `RESEND_API_KEY`, `SMTP_SENDER_EMAIL`.

Mobile apps have **no runtime env** — Supabase URL/key and the API base are compiled in; the only build-time
injections are the RevenueCat public keys and PostHog keys above.

### `VERCEL_TOKEN`: web goes live only after the database deploy

Vercel builds every main commit and, by default, points the production domains (`learnwithalphonso.com`,
`admin.learnwithalphonso.com`, as set in `scripts/promote-vercel.ts`) at the build as soon as it is ready, which can be before the CI job "Deploy Supabase
migrations + Edge Functions" has applied the migrations the new code needs. The CI job **"Promote web to
production"** (`promote-web` in `.github/workflows/ci.yml`, runs after that deploy; logic in
`scripts/promote-vercel.ts`) points both domains at this commit's Vercel build once the database is ready. It never
moves production back to an older commit, and skips a project Vercel did not build for that commit.

`VERCEL_TOKEN` is present in the repo's Actions secrets (`gh secret list`, name only). **⚠ O** if ever removed: without the secret the job prints a warning and passes, and Vercel keeps going live on its own.

Owner steps, in this order:

1. Vercel → Account Settings → Tokens: create a token scoped to the team **shayans-projects-d00acc44** (the team that
   owns `learnwithalphonso` and `learnwithalphonso-admin`), with an expiry you will track.
2. GitHub → repo Settings → Secrets and variables → Actions → New repository secret: name `VERCEL_TOKEN`, value the
   token.
3. Merge any change to main and wait for "Promote web to production" to go green with a log line "now serves …" or
   "the production domain already serves this build" for both web and admin. While Auto-assign is still on, the
   second message is expected: the job sees that Vercel already moved the domain and sends no promote request.
4. Only after step 3 is green: on **both** Vercel projects, open Settings → Environments → Production → Branch
   Tracking and turn off **Auto-assign Custom Production Domains**. From then on each main build waits as a staged
   deployment until the job promotes it.

If the job fails after step 4, each project has its own outcome: web may already be on the new build while admin
stays on the previous one (or the other way round). A project that failed stays on its previous build (safe, just
stale). Check the job log, which has one line per project, and both domains before acting; then promote the stale
one by hand from that project's Deployments list (… → Promote), or rerun the job. The job also fails, without moving
anything, when git cannot tell whether the live commit is newer than this one. To undo the whole change, turn the
toggle back on.

---

## RevenueCat ↔ Supabase

There is **no RevenueCat webhook** and nothing in RevenueCat points at Supabase. Entitlement is pulled on demand
via the RevenueCat REST API using `REVENUECAT_SECRET_API_KEY`. So there is no webhook secret to manage.

---

## Quick "check these are set" list (the silent ones)

1. **`ADMIN_REQUIRE_AAL2`** on the admin project must be unset (or anything but `"false"`); the second factor is required by default.
2. **Supabase function secrets CI does not set:** `REVENUECAT_SECRET_API_KEY`, `OPENROUTER_API_KEY`,
   `SUBSCRIPTION_ID_SECRET`.
3. `SUBSCRIPTION_ID_SECRET` is **32+ chars** and **identical** in Vercel web + Supabase.
4. `REPORT_NOTIFY_SECRET` (Vercel) **equals** Vault `report_notify_secret`.
5. `APPLE_*` (Sign-in-with-Apple revocation) still present on Vercel web.
6. `REVENUECAT_API_KEY` (iOS) / `REVENUECAT_ANDROID_PUBLIC_KEY` are **production** keys, not `test_`.
