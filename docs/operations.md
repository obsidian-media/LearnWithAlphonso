# Operations

How to turn features off, and what runs on a schedule. For table privileges see `database-privileges.md`.

## Off switches

Table `public.app_switches` (service role only). Three rows (the `support_ai` row is described below the table):

| Key     | Turns off                                                                                                                                                           | What learners see                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`    | Every AI feature: conversation practice, speech-to-text, text-to-speech, AI translation grading, word lookup, generated practice, weakness detection, and the tutor | AI routes answer `503 {"error":"ai-unavailable"}`. Lesson and review answers are graded against the curated answers only, exactly as for a learner who has not allowed AI. |
| `tutor` | The paid voice tutor only                                                                                                                                           | The tutor answers `503 {"error":"tutor-unavailable"}`. Everything else keeps working.                                                                                      |

`support_ai` (added with the Help chat, `20261117100000`) turns off only the AI's answers in the Help chat; people still answer and a learner can always hand off. Unlike the other two it fails CLOSED: it is OFF in production, and a missing row or an unreadable table also counts as off. Turn it on only after the owner has reviewed the help file (`src/data/help-centre.ts`) and ten sample transcripts. If a hand-off to the support inbox fails twice the route answers 503 `support-unreachable`.

Lessons, reviews, progress, sign-in and purchases do not read these switches.

Turn one off (SQL editor, or any service-role connection):

```sql
UPDATE public.app_switches SET enabled = false, updated_at = now() WHERE key = 'ai';
```

Turn it back on with `enabled = true`. The web server caches the switches for 30 seconds per instance; Edge Functions read them on every request. If the switches cannot be read, they count as **on**: a database problem must not take AI away by accident.

With `ai` off, a correct translation that is not in a question's curated answer list is marked wrong, because the AI grader that would have accepted it is not consulted. That is the cost of the switch; it is not a bug.

## Scheduled maintenance

`pg_cron` job `maintenance-sweep` runs `public.run_maintenance_sweep()` every 15 minutes. It:

1. Deletes review-grade receipts (`review_grade_attempts`) older than 30 days.
2. Calls `POST /api/internal/maintenance` on the web app, authenticated by the Vault secret `report_notify_secret` (the same shared secret as the report notification route; the web app reads it from `REPORT_NOTIFY_SECRET`). Without the Vault secret, step 2 is skipped.

The route (`src/lib/maintenance.server.ts`) does three things and reports counts only:

- **Apple revocation retries.** When an account is deleted and Apple does not confirm that the Sign in with Apple grant was revoked, the stored credential is moved to `apple_revocation_pending` (no link to the deleted account). Each pass retries it. On success the row is removed. After 7 days it is removed anyway and the owner is emailed.
- **Report delivery.** Each moderation report is emailed to the owner when it is filed. Delivery is recorded in `content_report_delivery`. A report whose email did not go out is listed in a digest email on a later pass. A report still open after 20 hours gets one reminder, ahead of the 24-hour response window. Resolving a report in the admin app deletes it, so an open report is any row still in `content_reports`.

- **RevenueCat erasure retries.** See "Account deletion and other processors" below.

The sweep also retries "a person replied" notices that did not go out (after 10 minutes, giving up after 24 hours) and emails the owner one count of new support tickets (at most every 15 minutes); in the database it deletes support chats 12 months after they were solved (`support_purge_old()`).

Owner emails go to `REPORT_NOTIFY_TO` through Resend. If that is not set, the same events are logged with `console.error` and no email is sent.

Check the job:

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'maintenance-sweep';
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'maintenance-sweep')
ORDER BY start_time DESC LIMIT 5;
```

Stop it: `SELECT cron.unschedule('maintenance-sweep');`

## Account deletion and other processors

Deleting an account (by the learner or by an admin) also:

- revokes the Sign in with Apple grant, with the retry above if Apple is unreachable;
- erases the subscriber record at RevenueCat. This does not cancel an App Store subscription, which only the learner can do in their Apple account. If the erase fails, the account id waits in `revenuecat_erasure_pending` and the scheduled pass retries it. After 30 days the id is emailed to the owner to erase by hand in the RevenueCat dashboard, and removed from the list.

Account ids are not written to the server logs on any of these paths.

Staff deletion (#496) is recorded in `staff_audit_log` (`user.delete`, and `user.delete.failed` with the step for each failed web-subscription cancel or Apple revocation, which do not stop the deletion; only a failed Auth delete stops it). The action record keeps ids only and outlives the account on purpose.

## Monthly AI cost cap

The daily request caps (`consume_ai_quota`) bound requests, not cost, so each learner also has a MONTHLY ceiling on measured AI cost (the `ai_cost_log` + `ai_cost_daily` sum, USD micro-dollars) over the current UTC calendar month. Calendar month, not rolling 30 days: the learner is told one reset date ("1 December"), it follows the billing month, and a spike never lingers past it. Rules in `src/lib/ai-monthly-cap.ts`, enforcement in `src/lib/ai-monthly-cap.server.ts`, called first thing in `consumeQuotaFor` (so a refused call burns no burst token and no daily unit). Migration `20261120120000_ai_monthly_cost_cap.sql` adds the learner's own read `my_ai_cost_month()` and the admin count `admin_ai_cost_capped`.

**What is blocked.** Only the costly kinds: `chat`, `hector`, `tts`, `stt`, `recap`, `explain`, `translate`, `define`. Lessons, review, reading and the Help chat (`support`) never call it and keep working. A blocked call answers `429 { error: "quota-exceeded", reason: "monthly-cap", resetsAt: <first of next month>, message }`; web, iOS and Android show "You've hit this month's usage limit for AI practice. It resets on 1 December. Lessons and review still work." (a reset more than 36 hours away is the monthly one; the daily and per-minute copy is unchanged).

**Settings (web server environment, all optional; the only place the numbers live).**

- `AI_MONTHLY_CAP_FREE_USD` default `2`: a free learner's ceiling. Free learners pay nothing; this is an acquisition cost we accept, about a quarter of a Pro learner's.
- `AI_MONTHLY_CAP_PRO_USD` default `8`: a Pro learner's ceiling (never below the free one). The heavy-learner line on the Numbers page is CAD 12.99 x 85% x 0.72 = about USD 7.95; 8 keeps that same line, so a Pro learner at the cap is about break-even after store fees. A heavy learner used to be able to cost about USD 50 a month.
- `AI_MONTHLY_CAP_WARN_PERCENT` default `80`: where the soft warning starts.
- `AI_MONTHLY_CAP_ENABLED`: set to `false` to switch the cap off (kill switch, no deploy of code needed).

**Tier.** Pro is known only through RevenueCat, so it is looked up only for a learner already past 80% of the FREE ceiling (almost nobody), and Hector calls (already entitlement-checked) are Pro by construction.

**When the cost cannot be read (decided 2026-11-18).** A FREE learner is refused and a Pro learner is let through, so an unreadable cost never becomes unlimited cost for people who pay nothing. The tier comes from the entitlement lookup (a confirmed "active" is kept for 60 seconds per server, so a short RevenueCat outage does not make a paying learner look free): active is allowed; inactive, or entitlement unavailable too, is refused with `503 { error: "Could not verify your usage. Try again shortly." }` (not the cap's 429: the learner has not reached a limit, and the cap message names a reset date). Two states stay open on purpose: the cap switched off by `AI_MONTHLY_CAP_ENABLED=false`, and `my_ai_cost_month` not deployed yet (nothing exists to read). The Edge Functions apply the same cap to AI translation grading (`complete-lesson`, `grade-review`; `supabase/functions/_shared/ai-monthly-cap.ts`) with the same rule; there a refusal only means "no AI opinion" and the local verdict stands. **If your cap settings are not the defaults (2 / 8 / 80), set the same `AI_MONTHLY_CAP_FREE_USD`, `AI_MONTHLY_CAP_PRO_USD`, `AI_MONTHLY_CAP_WARN_PERCENT` (and `AI_MONTHLY_CAP_ENABLED`) as Supabase function secrets**, or web and Edge will disagree about the ceiling. Calls whose price is unknown (NULL cost) add nothing to the sum.

**Telling the client.** `GET /api/ai-usage` (signed in) answers `{ state: "ok" | "warn" | "capped" | "unknown", percentUsed, resetsAt }`: percent only, never a dollar figure; no client holds any number. Shown as the "AI practice this month" card in Settings on web (`src/lib/ai-usage-view.ts`), iOS (`AiUsage.swift`) and Android (`AiUsage.kt`); an unknown state or a failed read draws nothing. Known gap: the written-translation fallback inside the `grade-review` and `complete-lesson` edge functions (Deno) is not checked against the monthly cap (it stays under the 60 a day `translate` quota).

**Admin.** Numbers, "AI cost": "Learners at the monthly cap" counts learners over the Pro ceiling this month (certainly blocked) and notes how many more sit between the free and Pro ceilings (blocked unless Pro).

## AI cost tracking

Every billable AI call is logged to `ai_cost_log` (migration `20261118200000_ai_cost_log.sql`; service role only, no client grants): user id, kind (chat, hector, explain, translate, define, support, practice, weakness, stt, tts), vendor, model, units (STT audio seconds as Deepgram reports them, TTS characters sent, LLM tokens as OpenRouter reports them), estimated cost in USD micro-dollars, where the cost came from (`provider` = the vendor's own charge, `table` = our price table, `unknown` = NULL, never a guess), a cache-hit flag and the time. A write is handed to the platform's `waitUntil` (or simply runs on) and is bounded to 4 s: it can never fail or delay a learner's answer. Written by `src/lib/ai-cost-log.server.ts` (web routes, through `llmChatCompletion({ track })`, `/api/stt`, `/api/tts`, Hector's speech) and `supabase/functions/_shared/ai-cost-log.ts` (the written-translation grade in `grade-review` and `complete-lesson`; the edge side has no price table and logs the provider's charge or NULL). Owner-run authoring calls (pack drafts, vocab proposals) are not logged: no learner is billed for them.

**Prices** live in one file, `src/lib/ai-prices.ts`, each with its source page and the day it was read (Deepgram Nova-3 monolingual $0.0043 per minute and Aura-2 $0.030 per 1,000 characters, deepgram.com/pricing; the OpenRouter model list for token prices). OpenRouter's own reported cost wins when present; with BYOK the spend is its fee plus `upstream_inference_cost`. A model or voice that is not listed is logged with a NULL cost and counted under "Calls without a price" on the Numbers page. When a price changes, edit the row and move its date.

**Retention.** Raw rows are kept 90 days. `rollup_ai_cost_log(90)` (called from the 15-minute maintenance sweep; a no-op when nothing is old) moves each whole UTC day older than that into `ai_cost_daily` (one row per day, learner, kind and vendor) in one statement. On-read rollup was not chosen: the sweep already exists and keeps the admin query bounded to raw rows.

**Admin.** Numbers, "AI cost" group (scope `numbers.revenue`): spend today / 7 / 30 days by vendor and by kind, cost per active learner (average, median, 90th percentile, highest), heavy learners over the monthly line, the top 20 by an 8-character id prefix (no names or emails), the voice cache hit rate, and calls without a price. "Not connected" while the migration is not applied or nothing has been logged; a real $0 is shown as $0. It replaces the old count-times-guess estimate.

**Daily spend alert.** Once a day (after 01:00 UTC, claimed in `ai_cost_alert_days`) the sweep looks at yesterday and emails `REPORT_NOTIFY_TO` when the total or any one learner crossed a threshold. The sender is `SUPPORT_NOTIFY_FROM`: unset, the alert is logged and skipped (it never crashes the sweep); a failed send is retried on the next pass. Settings (all optional, defaults in `src/lib/ai-cost-config.ts`): `AI_COST_ALERT_DAILY_TOTAL_USD` (25), `AI_COST_ALERT_DAILY_USER_USD` (1.5), `AI_COST_USD_PER_CAD` (0.72), `AI_COST_HEAVY_PRICE_CAD` (12.99), `AI_COST_HEAVY_SHARE` (0.85). The heavy line is CAD 12.99 x 85% x the rate, about $7.95 a month, an estimate. Set the alert settings on the web app and the heavy-line settings on the admin app (the Numbers page reads them there).

**AI spend circuit breaker.** Every 15-minute maintenance pass (`sweepAiCost`) asks the database `trip_ai_spend_breaker(limit)` (migration `20261125130000`), which adds up TODAY's (UTC) estimated spend over every learner. At or over `AI_SPEND_BREAKER_DAILY_USD` (default `100`, four times the daily alert; `AI_SPEND_BREAKER_ENABLED=false` turns it off) and with the `ai` switch on, it turns the `ai` switch in `app_switches` OFF in one UPDATE and the sweep emails `REPORT_NOTIFY_TO` once (sender `SUPPORT_NOTIFY_FROM`; the flip is the trip, so there is one email per trip, not per pass or per request). With the switch off every AI route answers `503 ai-unavailable` within 30 seconds on every server (the switch cache) and the Edge Functions fall back to local grading; lessons, review and progress keep working. The worst case between the limit being reached and the switch flipping is one sweep interval (15 minutes) of extra spend; there is no check on the request path. **It never turns AI back on by itself.** To reset: look at the Numbers page (AI cost), then either raise `AI_SPEND_BREAKER_DAILY_USD` on Vercel or wait for the UTC day to change, and run `UPDATE public.app_switches SET enabled = true, note = NULL, updated_at = now() WHERE key = 'ai';` (if today's spend is still over an unchanged limit, the next pass trips it again). A breaker that cannot be asked, or that tripped but could not send its email, makes the maintenance pass report a failure (HTTP 500, `ok: false` and `ai-spend-breaker` in `failures` in the database request log) as well as logging it (`[ai-cost] BREAKER TRIPPED` / `breaker email failed`); the switch is off regardless.

**Speech cache.** The audit found three kinds of text sent to `/api/tts`: scene openers and name-less Hector greetings (fixed, the same for every learner: 248 lines across en/fr/es, about 75 to 87 characters each, so about $0.0024 per request), and model replies (written for one learner). Only an exact match against those fixed lines is kept: private `tts-cache` bucket, key = SHA-256 of voice + format + text, read and written by `/api/tts` with the service role after the learner is authenticated. Everything else, and every greeting with a name, is never stored. A hit still spends the learner's quota unit and no limit changed; it is logged with `cache_hit` true and cost 0. Estimated saving (not yet measured): every repeat opener or greeting after the first request per voice, about $2.40 per 1,000 call starts. Read the real rate on the Numbers page once it has run.

## Staff console and types regeneration

- **Staff console.** Set `ADMIN_REQUIRE_AAL2=true` on the admin Vercel project once an authenticator is enrolled. Add staff from the Staff page (they must have signed up first). An `admin_users` member with no `staff_roles` row is treated as owner; inserting the owner's row is recommended. The Edge Functions `complete-lesson`, `complete-podcast-quiz`, `grade-review`, `start-lesson-session`, `complete-story-check` and `get-season-status` must be deployed from `main` so a ban stops them at once.
- **Types.** `regenerate-supabase-types.yml` regenerates `src/integrations/supabase/types.ts` after a successful `deploy-supabase` on `main` (#484); a `chore: regenerate supabase types` commit after a migration merge is expected. It can still be dispatched by hand.
- **Numbers dashboard (admin project `learnwithalphonso-admin`, all optional; a group with a missing key shows "Not connected", never 0).** The groups are split by scope: `numbers.read` sees our database, Sentry and PostHog; `numbers.revenue` (owner by default, grantable on the Staff page) sees RevenueCat, the AI cost estimate, App Store and Google Play. Keys, each with the least permission it needs: Sentry `SENTRY_API_TOKEN` (scopes `org:read`, `event:read`), `SENTRY_ORG`, `SENTRY_PROJECTS` (`ios:slug,android:slug,web:slug`; slugs or numeric ids, slugs are resolved to ids once and remembered for 6 hours), `SENTRY_HOST` (default `sentry.io`); RevenueCat `REVENUECAT_METRICS_KEY` (a v2 secret key with only `charts_metrics:overview:read` and `charts_metrics:charts:read`) plus `REVENUECAT_PROJECT_ID`; PostHog `POSTHOG_PERSONAL_API_KEY` (Query Read only), `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` (default `us.posthog.com`); App Store `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` (the .p8 text), `ASC_VENDOR_NUMBER` (an App Store Connect API key with the Sales role), and `ASC_APP_ID` for the rating and to count only this app; Google Play `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_PLAY_REPORTS_BUCKET` (the `pubsite_prod_rev_...` bucket; the service account needs "View app information (read-only)" globally in Play Console). Each provider call times out at 8 seconds (App Store: 25 seconds, it reads up to 30 daily reports) and results are cached for 5 minutes per window (App Store: 6 hours); Refresh bypasses the cache (6 a minute per person). The AI cost is an estimate: `ai_usage` counts times the per-kind prices in `src/lib/numbers-core.ts` (`AI_PRICE_USD`); correct them there.

- **Server hearts.** `SERVER_HEARTS` enforces by default (#494); set it to exactly `shadow` or `off` to back out. The Edge Functions need `REVENUECAT_SECRET_API_KEY` in Supabase secrets or nobody counts as Pro there.
- **Analytics.** PostHog is off until the learner opts in and until a key is set (`VITE_POSTHOG_KEY`, iOS `PostHogKey`, Android `POSTHOG_PROJECT_KEY`); see `docs/privacy-and-data.md`.

## Deadlines on provider calls

No request waits on a provider without a limit. A timeout returns a retryable `504`.

| Call                                                          | Deadline                            |
| ------------------------------------------------------------- | ----------------------------------- |
| Model call with no caller deadline (web and Edge helper)      | 30 s                                |
| Owner-run authoring calls (pack drafts, vocabulary proposals) | 120 s                               |
| Conversation reply (`/api/chat`)                              | 25 s, output capped at 1,024 tokens |
| Tutor reply / tutor speech                                    | 20 s / 10 s                         |
| Speech-to-text (`/api/stt`)                                   | 20 s                                |
| Text-to-speech (`/api/tts`)                                   | 30 s                                |
| Subscription check and RevenueCat erase                       | 5 s                                 |

## Abuse limits

Not switches, fixed in the database: `complete-lesson` and `complete-podcast-quiz` share a rolling-hour ceiling of 60 paid completions per user (`consume_lesson_completion_slot`; there is no minimum lesson time and no daily XP cap). Daily AI allowances per user: chat 60, speech-to-text 120, text-to-speech 80, translate 60, define 40, Hector 150 (`consume_ai_quota`; per-minute limits in `consume_ai_rate_limit`). Raising one means a new migration that restates the whole function plus the matching constant in `src/lib/ai-quota.server.ts`.

## Crash reporting

Sentry (org `obsidian-media`) receives crashes and errors from production web, iOS and Android release builds only; see `docs/sentry-crash-reporting.md`. It is not an alerting setup: look at the three projects in Sentry.

## Uptime check

`.github/workflows/uptime.yml` runs every 15 minutes from GitHub, outside the app. It makes six unauthenticated requests (landing page, privacy policy, a server route, the sign-in service, the database API, an Edge Function) and fails if any does not give the status a healthy service gives. A failed run is the alert: GitHub notifies people watching the repository's Actions. Turn that on under GitHub **Settings > Notifications > Actions** ("Send notifications for failed workflows only").

It does not see slow responses, errors inside a signed-in session, or a scheduled job that stopped running. For the scheduled job use the queries above.

## Migrations

Rehearse a migration's exact statements in a rolled-back transaction on the project before merging it (`BEGIN; ...; ROLLBACK;` through the SQL editor or the service-role connection). A static review missed the first themes migration (#512): the old `profiles.theme` CHECK did not allow `royal`, so the deploy failed and applied nothing until #516 reordered the statements.

## Outbound HTTP from the database (`net`)

The scheduled pass, the report notification trigger and the push nudge trigger send HTTP requests through the `pg_net` extension (`net.http_post`). Supabase's defaults let every role, including `anon` and `authenticated`, call `net.http_*` and read and write `net._http_response`. Those grants belong to `supabase_admin`, so a migration (which runs as `postgres`) cannot revoke them: the `REVOKE` succeeds with a warning and changes nothing.

They are safe today because the API serves only the `public` and `graphql_public` schemas, and the three callers are `SECURITY DEFINER` functions owned by `postgres`. Keep it that way:

- Never add `net` to **Project Settings > API > Exposed schemas**.
- Call `net.*` only from `SECURITY DEFINER` functions, never from a function a client can run as itself.
- To check: `select has_function_privilege('anon', 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'EXECUTE');` is expected to be true; the API refusing `Accept-Profile: net` with `PGRST106` is what protects it.

The advisor's "extension in public" note for `pg_net` is cosmetic: the extension puts no objects in `public`, and moving it means dropping and recreating it in production.
