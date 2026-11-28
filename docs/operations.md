# Operations

How to turn features off, and what runs on a schedule. For table privileges see `database-privileges.md`. Checked against code, production and GitHub on 2026-11-22 (main d8350542, #705); delta pass 2026-11-25 against main 236cb8f1 (#717): sections on the Hector turn token, route timing, billing and the sweep were updated.

## Where things run (2026-11-22)

| What | Address |
| --- | --- |
| Web app | https://learnwithalphonso.com (Vercel project `learnwithalphonso`; answers 200) |
| Admin console | https://admin.learnwithalphonso.com (Vercel project `learnwithalphonso-admin`; answers 200) |
| Supabase API, auth, Edge Functions | https://api.learnwithalphonso.com (Supabase custom domain; `/auth/v1/health` answers 401 without a key, as on the project URL). The uptime check and the apps use it. |
| Old web host | `learn.alphonsoecosystem.app` still answers 200. The database's maintenance sweep still posts to `https://learn.alphonsoecosystem.app/api/internal/maintenance` (hard-coded in `run_maintenance_sweep`, latest body `20261128100000`, which only adds the `hector_turn_token_uses` delete, #717), so retiring that host needs a migration that repoints it first. |
| Marketing site | discover.alphonsoecosystem.app (separate repo and Vercel project) |

Email goes through Resend from `@hello.learnwithalphonso.com`: owner report alerts from `reports@` (`REPORT_NOTIFY_FROM` overrides), Help notices from `support@` (`SUPPORT_NOTIFY_FROM` overrides). Supabase auth email (sign-in codes) uses the project's SMTP settings (the deploy log prints `smtp_host`; GitHub secrets `SMTP_SENDER_EMAIL` and `RESEND_API_KEY` exist; the template is managed by `configure-auth-emails.yml`). Plan and limits (unverified here: the Resend and Supabase billing pages were not readable in this pass; the owner's figures are Resend free plan, about 100 emails a day, Supabase Pro on Micro compute, auth email limit 100 an hour): `scripts/check-auth-config.ts` prints the live `rate_limit_email_sent` in every deploy log, so read the real number there.

Vercel Production variables on the web project, by name (`vercel env ls production`, 2026-11-22; values never read): `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_V2_SECRET_KEY`, `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEB_PRODUCT_ID`, `REVENUECAT_WEB_YEARLY_PRODUCT_ID`, four `REVENUECAT_WEB_*PURCHASE_LINK*` links, `VITE_POSTHOG_KEY`, `SUBSCRIPTION_ID_SECRET`, `VITE_TURNSTILE_SITE_KEY`, `OPENROUTER_API_KEY`, `DEEPGRAM_API_KEY`, `LESSON_SESSION_SECRET`, `REPORT_NOTIFY_TO`, `REPORT_NOTIFY_SECRET`, `RESEND_API_KEY`, `DEMO_ACCOUNT_EMAIL`, `REVIEW_DEMO_CODE_KEY`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TEAM_ID`, `HECTOR_VOICE_SUPABASE_URL`, `HECTOR_VOICE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_URL` (meant to be the `api.learnwithalphonso.com` custom domain; (unverified: the values were deliberately not read)), `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Not set on the web project:** `ADMIN_REQUIRE_AAL2` (web has no console), `APPLE_TOKEN_ENCRYPTION_KEY`, `SERVER_HEARTS` (defaults to enforcing), `REVENUECAT_REJECT_SANDBOX`, every `AI_MONTHLY_CAP_*`, `AI_COST_*` and `AI_SPEND_BREAKER_*` (all defaults apply). Update 2026-11-25: `SUPPORT_NOTIFY_FROM` and `REPORT_NOTIFY_FROM` are now SET on the web Production environment (coordinator read-back of names on 2026-11-22; the agent API answers 403 on these, so the values were not read and are not re-verified here). The admin project does not read them. Why it matters: without `SUPPORT_NOTIFY_FROM` the daily AI spend alert, the spend-breaker email and the operational-event alert are logged and skipped (see below), so a tripped breaker would switch AI off and tell nobody. Per the same read-back `NVIDIA_*` settings exist in neither project, `AI_COST_ALERT_DAILY_*` are unset (code defaults apply) and all six `REVENUECAT_WEB_*` settings and `REVENUECAT_SECRET_API_KEY` are set on both projects. On the admin project the Numbers providers PostHog (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`), App Store Connect (`ASC_*`) and Google Play (`GOOGLE_PLAY_*`) are NOT set, so those groups show Not connected (open item). The admin project holds `ADMIN_REQUIRE_AAL2`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_*` (including `SENTRY_API_TOKEN`) and the RevenueCat keys (`REVENUECAT_METRICS_KEY`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_V2_SECRET_KEY`, `REVENUECAT_SECRET_API_KEY`).

## Build costs (Vercel)

Both Vercel projects (`learnwithalphonso`, `learnwithalphonso-admin`) build from this repo's root `vercel.json`. Build
CPU was the bill driver (about 7,700 minutes a month on each project), so `vercel.json` sets
`"ignoreCommand": "sh scripts/vercel-ignore-build.sh"`:

- **Previews are off by design.** Every PR and branch push (`VERCEL_ENV` not `production`) is skipped. PR checks run in
  GitHub Actions (`.github/workflows/ci.yml`) and production is promoted by `scripts/promote-vercel.ts`; none of that
  needs a preview URL, and the Vercel PR checks are not among the required checks.
- **Production builds are skipped for native, docs, CI and database-only commits.** A main commit is skipped only when
  every file changed since the last built commit is under `ios/`, `android/`, `docs/`, `.github/`, `.claude/`,
  `supabase/migrations/`, `supabase/functions/` or is a root-level `*.md`. Anything else, an unknown previous commit or
  a failing `git diff` builds. The list lives in `src/lib/vercel-ignore-build.ts` (tested, with a parity test against
  the script). Vercel records a skipped build as Canceled; the "Promote web to production" CI job treats that as
  "nothing to promote" and stays green.
- **One-off preview:** run `vercel deploy` from a checkout (it uploads a build, the ignore step only applies to
  git-triggered builds), or temporarily remove `ignoreCommand` on a branch (the rule is per commit, so the branch's own
  `vercel.json` decides).

Owner dashboard settings (not in code, set per project, both projects):

1. Settings -> Build and Deployment -> Build Machine: **Standard** (the larger machines bill more per minute).
2. Settings -> Build and Deployment -> Deployment Retention: shorten it for **Preview** deployments (leftover previews
   of merged branches pile up).
3. Team Settings -> Billing -> Spend Management: set a monthly budget and alerts so a spike pauses or warns instead of
   showing up on the invoice.

## Off switches

Table `public.app_switches` (service role only). Three rows, all currently `enabled = true` in production (2026-11-22; the `support_ai` row is described below the table):

| Key     | Turns off                                                                                                                                                           | What learners see                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`    | Every AI feature: conversation practice, speech-to-text, text-to-speech, AI translation grading, word lookup, generated practice, weakness detection, and the tutor | AI routes answer `503 {"error":"ai-unavailable"}`. Lesson and review answers are graded against the curated answers only, exactly as for a learner who has not allowed AI. |
| `tutor` | The paid voice tutor only                                                                                                                                           | The tutor answers `503 {"error":"tutor-unavailable"}`. Everything else keeps working.                                                                                      |

`support_ai` (added with the Help chat, `20261117100000`) turns off only the AI's answers in the Help chat; people still answer and a learner can always hand off. Unlike the other two it fails CLOSED: a missing row or an unreadable table counts as off. It was OFF at launch and the owner turned it ON on 2026-11-19 (the row's note says so; ON in production on 2026-11-22). Before any re-enable after an off, review the help file (`src/data/help-centre.ts`) and sample transcripts again. If a hand-off to the support inbox fails twice the route answers 503 `support-unreachable`.

Lessons, reviews, progress, sign-in and purchases do not read these switches.

Turn one off (SQL editor, or any service-role connection):

```sql
UPDATE public.app_switches SET enabled = false, updated_at = now() WHERE key = 'ai';
```

Turn it back on with `enabled = true`. The web server caches the switches for 30 seconds per instance; Edge Functions read them on every request. If the switches cannot be read, they count as **on**: a database problem must not take AI away by accident.

With `ai` off, a correct translation that is not in a question's curated answer list is marked wrong, because the AI grader that would have accepted it is not consulted. That is the cost of the switch; it is not a bug.

### Rehearsals: the global switch and one account

`REHEARSALS_ENABLED` (a Vercel environment variable, on only when it is exactly `true`) is the global kill switch. On top of it, one account can be switched off with `public.set_rehearsals_off` (migration `20261130100000`). The table behind it, `public.rehearsals_off`, is service role only, so a client can never turn itself back on. Off for the account wins over on for everyone: `/api/rehearsal` (every verb), the rehearsal mode of `/api/chat`, `features.rehearsals` in `/api/app-config` (for a caller that sends its token) and the path's pinned rehearsal all refuse for it.

Turn one account off, or back on (SQL editor, or any service-role connection; the reason is required and goes into the action record):

```sql
SELECT public.set_rehearsals_off('<user uuid>', true,  'why', '<your staff user uuid, optional>');
SELECT public.set_rehearsals_off('<user uuid>', false, 'why', '<your staff user uuid, optional>');
```

It returns `true` when something changed. Find the id with the console's learner search. A rehearsal ends by itself with outcome `none` 7 days after its event date, or 30 days after its last activity when it has no date: when the learner's rehearsals are read or created, and once a day for everyone (`rehearsals-close-stale`). The counts of rehearsals started, stages finished, outcomes tapped and paywalls shown are on the System health page (no account, no text).

## Scheduled maintenance

`pg_cron` job `maintenance-sweep` (`*/15 * * * *`, active; 96 runs, all `succeeded`, in the 24 hours before 2026-11-22) runs `public.run_maintenance_sweep()` every 15 minutes. It is the only `pg_cron` job. It:

1. Records two health probes (`ops_health_checks`: a timed read of an application table and of `auth.users`; the admin Health screen draws its 90-day bars from them), each in its own block so a failure is recorded as `ok = false` and never stops the rest.
2. Prunes: `review_grade_attempts` older than 30 days, `ai_usage` 90 days, `nudges` 90 days, `friend_activity_events` 180 days (league promotions kept), `podcast_play_events` 400 days, `content_reports` 90 days after the account's deletion, `lesson_session_redemptions` 7 days, `ops_events` 90 days, `ops_health_checks` 120 days, `hector_turn_token_uses` rows past their expiry (migration `20261128100000`, #717); and calls `support_purge_old()` (solved support chats, 12 months).
3. Calls `POST /api/internal/maintenance` on the web app, authenticated by the Vault secret `report_notify_secret` (present in production; the same shared secret as the report notification route; the web app reads it from `REPORT_NOTIFY_SECRET`). Without the Vault secret, step 3 is skipped. The URL is hard-coded in the function (currently the old `learn.alphonsoecosystem.app` host, see above).

The other scheduled work is on GitHub: `uptime.yml` every 15 minutes (`7,22,37,52 * * * *`) and `vocab-image-links.yml` weekly (Monday 06:17 UTC).

The route (`src/lib/maintenance.server.ts`) does the following and reports counts only (it also runs the AI cost rollup, the daily spend alert, the spend breaker and the operational-event alert described below):

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

**Retention.** Raw rows are kept 90 days. `rollup_ai_cost_log(90)` (called by the maintenance route's `sweepAiCost` pass, not by the SQL sweep; a no-op when nothing is old) moves each whole UTC day older than that into `ai_cost_daily` (one row per day, learner, kind and vendor) in one statement. On-read rollup was not chosen: the sweep already exists and keeps the admin query bounded to raw rows.

**Admin.** Numbers, "AI cost" group (scope `numbers.revenue`): spend today / 7 / 30 days by vendor and by kind, cost per active learner (average, median, 90th percentile, highest), heavy learners over the monthly line, the top 20 by an 8-character id prefix (no names or emails), the voice cache hit rate, and calls without a price. "Not connected" while the migration is not applied or nothing has been logged; a real $0 is shown as $0. It replaces the old count-times-guess estimate.

**Daily spend alert.** Once a day (after 01:00 UTC, claimed in `ai_cost_alert_days`) the sweep looks at yesterday and emails `REPORT_NOTIFY_TO` when the total or any one learner crossed a threshold. The sender is `SUPPORT_NOTIFY_FROM`: unset, the alert is logged and skipped (it never crashes the sweep); a failed send is retried on the next pass. It was unset on the web project in production on 2026-11-22 morning, so the alert was only logged; both `SUPPORT_NOTIFY_FROM` and `REPORT_NOTIFY_FROM` have since been set on Vercel production (coordinator read-back, names only; re-check with `vercel env ls production`). Unlike the Help notices, this sweep and the ops-alert sweep have no code default for the sender (`ai-cost-sweep.server.ts:302`, `ops-alert-sweep.server.ts:151`). Settings (all optional, defaults in `src/lib/ai-cost-config.ts`): `AI_COST_ALERT_DAILY_TOTAL_USD` (25), `AI_COST_ALERT_DAILY_USER_USD` (1.5), `AI_COST_USD_PER_CAD` (0.72), `AI_COST_HEAVY_PRICE_CAD` (12.99), `AI_COST_HEAVY_SHARE` (0.85). The heavy line is CAD 12.99 x 85% x the rate, about $7.95 a month, an estimate. Set the alert settings on the web app and the heavy-line settings on the admin app (the Numbers page reads them there).

**AI spend circuit breaker.** Every 15-minute maintenance pass (`sweepAiCost`) asks the database `trip_ai_spend_breaker(limit)` (migration `20261125130000`), which adds up TODAY's (UTC) estimated spend over every learner. At or over `AI_SPEND_BREAKER_DAILY_USD` (default `100`, four times the daily alert; `AI_SPEND_BREAKER_ENABLED=false` turns it off) and with the `ai` switch on, it turns the `ai` switch in `app_switches` OFF in one UPDATE and the sweep emails `REPORT_NOTIFY_TO` once (sender `SUPPORT_NOTIFY_FROM`; the flip is the trip, so there is one email per trip, not per pass or per request). With the switch off every AI route answers `503 ai-unavailable` within 30 seconds on every server (the switch cache) and the Edge Functions fall back to local grading; lessons, review and progress keep working. The worst case between the limit being reached and the switch flipping is one sweep interval (15 minutes) of extra spend; there is no check on the request path. **It never turns AI back on by itself.** To reset: look at the Numbers page (AI cost), then either raise `AI_SPEND_BREAKER_DAILY_USD` on Vercel or wait for the UTC day to change, and run `UPDATE public.app_switches SET enabled = true, note = NULL, updated_at = now() WHERE key = 'ai';` (if today's spend is still over an unchanged limit, the next pass trips it again). With `SUPPORT_NOTIFY_FROM` unset (it was, until 2026-11-22; it is set now) a trip turns the switch off but sends no email (it logs `breaker email NOT sent`, once; the trip is not retried), so nobody is told. A breaker that cannot be asked, or that tripped but could not send its email, makes the maintenance pass report a failure (HTTP 500, `ok: false` and `ai-spend-breaker` in `failures` in the database request log) as well as logging it (`[ai-cost] BREAKER TRIPPED` / `breaker email failed`); the switch is off regardless.

**Speech cache.** The audit found three kinds of text sent to `/api/tts`: scene openers and name-less Hector greetings (fixed, the same for every learner: 248 lines across en/fr/es, about 75 to 87 characters each, so about $0.0024 per request), and model replies (written for one learner). Only an exact match against those fixed lines is kept: private `tts-cache` bucket, key = SHA-256 of voice + format + text, read and written by `/api/tts` with the service role after the learner is authenticated. Everything else, and every greeting with a name, is never stored. A hit still spends the learner's quota unit and no limit changed; it is logged with `cache_hit` true and cost 0. Estimated saving (not yet measured): every repeat opener or greeting after the first request per voice, about $2.40 per 1,000 call starts. Read the real rate on the Numbers page once it has run.

## Story narration (pre-recorded)

Graded and branching stories are narrated from pre-recorded files, not live speech: one Deepgram MP3 per sentence, recorded once with the course's Alphonso voice (`DEFAULT_VOICES.alphonso`: en `aura-2-saturn-en`, es `aura-2-javier-es`, fr `aura-2-hector-fr`). The files live in the public `podcast-audio` bucket under `stories/<storyId>/`, next to a `manifest.json` that lists each recorded sentence by its text. Readers on web, iOS and Android look a sentence up by its text, so an edited sentence has no recording until the script runs again and simply falls back to live `/api/tts` speech; a fully recorded story plays with no AI call, no AI quota and no AI consent. Files are named from a hash of voice + text and cached for a year; the manifest is cached for 5 minutes. No migration: the bucket already exists, is public, and only the service role writes to it. The `stories/` files stay in the public bucket (unlike unpublished podcast audio, which is private): a public bucket hides nothing, so generate audio only for stories that are published.

**Owner command** (Git Bash, from the repo root; keys come from the environment, or from `~/.alphonso-secrets/podcast.env`, which must hold `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEEPGRAM_API_KEY`). Without `--confirm` it is a dry run that prints what it would record and the Deepgram cost:

```
bun run scripts/story-audio.ts generate                 # dry run, all published stories
bun run scripts/story-audio.ts generate --confirm       # record whatever is missing
bun run scripts/story-audio.ts generate --story <uuid> --confirm    # still only if that story is published
bun run scripts/story-audio.ts generate --course es --confirm
```

It is idempotent: a sentence already recorded in the same voice is skipped, so run it again after publishing a story or editing a sentence. Other flags: `--slugs a,b,c` (published stories with those slugs) and `--include-unpublished` (hidden stories; needs `--slugs` or `--story`). Cost: Aura-2 at $0.030 per 1,000 characters; the dry run prints the exact figure for what is missing. Production holds 47 published stories (en 17, fr 15, es 15 on 2026-11-22), including the Mona's New City editions (#691). Check the voice by playing one story in each course after the first run.

## Staff console and types regeneration

- **Staff console.** A second factor is required by default: every staff member must enrol an authenticator (the sign-in page walks them through it) before they can use the console; only `ADMIN_REQUIRE_AAL2=false` turns it off (never in production). Add staff from the Staff page (they must have signed up first). An `admin_users` member with no `staff_roles` row is treated as owner; inserting the owner's row is recommended. The Edge Functions `complete-lesson`, `complete-podcast-quiz`, `grade-review`, `start-lesson-session`, `complete-story-check`, `finish-branching-story` and `get-season-status` must be deployed from `main` so a ban stops them at once.
- **Types.** The migration's own PR regenerates `src/integrations/supabase/types.ts` (`types-gen` and `types-push` jobs in `ci.yml`). `regenerate-supabase-types.yml` is the safety net: it runs after a successful CI run on `main` and commits only if production's types differ (a `chore: regenerate supabase types` commit is then expected, not routine); it can also be dispatched by hand.
- **Curriculum data.** The `deploy-supabase` job's "Seed curriculum data" step in `ci.yml` seeds lessons and questions on every main deploy (skipped with a warning only if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing). Nobody runs the seed by hand.
- **Numbers dashboard (admin project `learnwithalphonso-admin`, all optional; a group with a missing key shows "Not connected", never 0).** The groups are split by scope: `numbers.read` sees our database, Sentry and PostHog; `numbers.revenue` (owner by default, grantable on the Staff page) sees RevenueCat, the AI cost estimate, App Store and Google Play. Keys, each with the least permission it needs: Sentry `SENTRY_API_TOKEN` (scopes `org:read`, `event:read`), `SENTRY_ORG`, `SENTRY_PROJECTS` (`ios:slug,android:slug,web:slug`; slugs or numeric ids, slugs are resolved to ids once and remembered for 6 hours), `SENTRY_HOST` (default `sentry.io`); RevenueCat `REVENUECAT_METRICS_KEY` (a v2 secret key with only `charts_metrics:overview:read` and `charts_metrics:charts:read`) plus `REVENUECAT_PROJECT_ID`; PostHog `POSTHOG_PERSONAL_API_KEY` (Query Read only), `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` (default `us.posthog.com`); App Store `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` (the .p8 text), `ASC_VENDOR_NUMBER` (an App Store Connect API key with the Sales role), and `ASC_APP_ID` for the rating and to count only this app; Google Play `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE`, `GOOGLE_PLAY_REPORTS_BUCKET` (the `pubsite_prod_rev_...` bucket; the service account needs "View app information (read-only)" globally in Play Console). Each provider call times out at 8 seconds (App Store: 25 seconds, it reads up to 30 daily reports) and results are cached for 5 minutes per window (App Store: 6 hours); Refresh bypasses the cache (6 a minute per person). The AI cost comes from `ai_cost_log` and the prices in `src/lib/ai-prices.ts` (see "AI cost tracking"). Which groups are connected today (names set on the admin Vercel project, 2026-11-22): Sentry (`SENTRY_API_TOKEN`; `SENTRY_PROJECTS` is not set) and RevenueCat (`REVENUECAT_METRICS_KEY`, `REVENUECAT_PROJECT_ID`) have keys; no PostHog, App Store or Google Play key names are set, so those groups show "Not connected".

- **Server hearts.** `SERVER_HEARTS` enforces by default (#494); set it to exactly `shadow` or `off` to back out. The Edge Functions need `REVENUECAT_SECRET_API_KEY` in Supabase secrets or nobody counts as Pro there.
- **Analytics.** PostHog is off until the learner opts in and until a key is set (`VITE_POSTHOG_KEY`, iOS `PostHogKey`, Android `POSTHOG_PROJECT_KEY`); see `docs/privacy-and-data.md`.

## Operational events (System health)

Server-side failures that used to be only console lines are also written to `public.ops_events` (service role only): `hearts_settlement_failed`, `lesson_result_finalize_failed`, `hearts_settlement_shadow_pro_unknown` and `hearts_settlement_shadow_stale_pro`, from the web server (`src/lib/ops-events.server.ts`) and the `complete-lesson` Edge function (`_shared/ops-events.ts`). Recording is best effort with a 2 second bound and never fails or delays a lesson save. `detail` holds ids, codes and counts only.

- **Look**: admin console, System health (needs the `numbers.read` scope). Counts for 24 hours and 7 days, last occurrence, green/amber/red, and the latest 50 rows.
- **Thresholds**: one object, `src/lib/ops-events-config.ts` (amber and red by the 24 hour count, `alertPerHour` for the email). A new event name is shown automatically with the default thresholds; add it there to tune it.
- **Alert**: the 15-minute maintenance sweep emails `REPORT_NOTIFY_TO` when an event's last-hour count reaches its `alertPerHour`, at most once per event per 24 hours (`ops_event_alerts` keeps the time). A failed send is retried on the next pass.
- **Retention**: rows older than 90 days are deleted by `run_maintenance_sweep`.

## Hector voice (web) and route timing

Since #716 and #717 the web plays every Hector reply through one persistent audio element (`src/lib/voice-playback.ts`); a refused play falls back to the device voice and a visible "Tap to hear Hector" button, and emits the web-only analytics event `voice_playback_failed` (surface, reason, error name; no text; opt-in analytics). `/api/hector-respond` answers 200 with the text even when the voice failed or was too large: `audio_base64` is then `""` (the key is always present, `src/lib/hector-conversation.ts:137-170`; iOS reads an empty string as no audio, `HectorView.swift:668-670`, Android `AiConversationClient.kt:276`) and the quota unit is not wasted.

The web asks for a split turn with `split_tts: true` (`hector-respond.ts:233`): the reply comes back at once with `tts_token` and `audio_base64: ""`, and the browser fetches the speech in sentence-sized parts from `POST /api/tts?turn=<token>&part=<n>`. The token is an HMAC over user, reply text and expiry, keyed by the existing `LESSON_SESSION_SECRET` (2 minute window, `src/lib/hector-turn-token.server.ts`); nothing new to set, and with the secret missing the route answers with inline audio. A turn request skips the second quota charge, never uses the shared speech cache, and each (token, part) may be spoken twice: the count is `public.hector_turn_token_uses` via `consume_hector_turn_use` (service role only; third use 429 `turn-replay-limit`, unreadable count 503 `turn-unavailable`, in which case the client uses the device voice). Expired rows are deleted by `run_maintenance_sweep`. Native never sends `split_tts` and gets inline audio as before.

Where a slow reply spends its time: `/api/hector-respond`, `/api/chat`, `/api/stt` (stages auth, quota, budget, deepgram, settle), `/api/tts` (auth, cache, deepgram, uses; for a streamed body `total` is time to first byte) and `/api/call-recap` (auth, call, claim, llm, memory) each write one `[ai-timing] route=... status=...` log line and a `Server-Timing` header (`src/lib/stage-timer.server.ts`, `timedRoute`). There are no before/after latency numbers yet (the #717 PR says none could be captured); a real-iPhone check of #716 and #717 is pending (open item).

## Billing (web) and launch state

Web purchases are RevenueCat Web Billing on the live Stripe account (no Stripe payment links); the purchase links return to `/pro-return`, and the RevenueCat and Stripe support address is support@learnwithalphonso.com. Prices (owner-reported 2026-11-22): monthly CA$12.99 / US$9.99, yearly CA$104.99. Tax collection was turned OFF on 2026-11-22 until the owner's GST/HST registration exists (RevenueCat cannot do tax-inclusive pricing for CA/US, so once registered the plan is to show "+ tax" in Canada). Checkout branding is done. A home-built trial-ending reminder email is planned after launch (RevenueCat sends none for one-week trials or monthly renewals). The real-card web purchase test was SKIPPED by the owner: the paywall, the purchase and refund path are unverified end to end (launch risk, open item). The paywall 503 fix is #713 (see `docs/ENV-SETUP.md`). Stripe, RevenueCat and App Store Connect state in this section comes from the owner and the coordinator; it could not be re-read from code.

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

Not switches, fixed in the database: `complete-lesson` and `complete-podcast-quiz` share a rolling-hour ceiling of 60 paid completions per user (`consume_lesson_completion_slot`; there is no minimum lesson time and no daily XP cap). Daily AI allowances per user: chat 60, speech-to-text 120, text-to-speech 80, translate 60, define 40, Hector 150, explain 40, support 30, recap 30 (`consume_ai_quota`, read from the deployed function 2026-11-22; per-minute limits in `consume_ai_rate_limit`). Raising one means a new migration that restates the whole function plus the matching constant in `src/lib/ai-quota.server.ts`.

## Crash reporting

Sentry (org `obsidian-media`) receives crashes and errors from production web, iOS and Android release builds only; see `docs/sentry-crash-reporting.md`. It is not an alerting setup: look at the three projects in Sentry.

## Uptime check

`.github/workflows/uptime.yml` runs every 15 minutes from GitHub, outside the app. It makes six requests against `https://learnwithalphonso.com` and `https://api.learnwithalphonso.com` (landing page, privacy policy, `POST /api/internal/maintenance` expecting 401, the sign-in service health, the database API with the public key, an Edge Function expecting 401) and fails if any does not give the status a healthy service gives. A failed run is the alert: GitHub notifies people watching the repository's Actions. Turn that on under GitHub **Settings > Notifications > Actions** ("Send notifications for failed workflows only").

It does not see slow responses, errors inside a signed-in session, or a scheduled job that stopped running. For the scheduled job use the queries above.

## Migrations

Rehearse a migration's exact statements in a rolled-back transaction on the project before merging it (`BEGIN; ...; ROLLBACK;` through the SQL editor or the service-role connection). A static review missed the first themes migration (#512): the old `profiles.theme` CHECK did not allow `royal`, so the deploy failed and applied nothing until #516 reordered the statements.

## Outbound HTTP from the database (`net`)

The scheduled pass (`run_maintenance_sweep`), the report notification trigger (`notify_content_report`), the push nudge trigger (`notify_nudge_push`) and the support staff-reply queue trigger (`support_queue_staff_reply`) send HTTP requests through the `pg_net` extension (`net.http_post`). Supabase's defaults let every role, including `anon` and `authenticated`, call `net.http_*` and read and write `net._http_response`. Those grants belong to `supabase_admin`, so a migration (which runs as `postgres`) cannot revoke them: the `REVOKE` succeeds with a warning and changes nothing.

They are safe today because the API serves only the `public` and `graphql_public` schemas, and the four callers (all `SECURITY DEFINER` functions in `public`) are owned by `postgres`. Keep it that way:

- Never add `net` to **Project Settings > API > Exposed schemas**.
- Call `net.*` only from `SECURITY DEFINER` functions, never from a function a client can run as itself.
- To check: `select has_function_privilege('anon', 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'EXECUTE');` is expected to be true; the API refusing `Accept-Profile: net` with `PGRST106` is what protects it.

The advisor's "extension in public" note for `pg_net` is cosmetic: the extension puts no objects in `public`, and moving it means dropping and recreating it in production.
