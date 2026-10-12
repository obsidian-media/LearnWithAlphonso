# Operations

How to turn features off, and what runs on a schedule. For table privileges see `database-privileges.md`.

## Off switches

Table `public.app_switches` (service role only). Two rows:

| Key     | Turns off                                                                                                                                                           | What learners see                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`    | Every AI feature: conversation practice, speech-to-text, text-to-speech, AI translation grading, word lookup, generated practice, weakness detection, and the tutor | AI routes answer `503 {"error":"ai-unavailable"}`. Lesson and review answers are graded against the curated answers only, exactly as for a learner who has not allowed AI. |
| `tutor` | The paid voice tutor only                                                                                                                                           | The tutor answers `503 {"error":"tutor-unavailable"}`. Everything else keeps working.                                                                                      |

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

The route (`src/lib/maintenance.server.ts`) does two things and reports counts only:

- **Apple revocation retries.** When an account is deleted and Apple does not confirm that the Sign in with Apple grant was revoked, the stored credential is moved to `apple_revocation_pending` (no link to the deleted account). Each pass retries it. On success the row is removed. After 7 days it is removed anyway and the owner is emailed.
- **Report delivery.** Each moderation report is emailed to the owner when it is filed. Delivery is recorded in `content_report_delivery`. A report whose email did not go out is listed in a digest email on a later pass. A report still open after 20 hours gets one reminder, ahead of the 24-hour response window. Resolving a report in the admin app deletes it, so an open report is any row still in `content_reports`.

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
- erases the subscriber record at RevenueCat. This does not cancel an App Store subscription, which only the learner can do in their Apple account. A failure is logged (`[account-deletion]`) so the record can be erased by hand in the RevenueCat dashboard.

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

## Uptime check

`.github/workflows/uptime.yml` runs every 15 minutes from GitHub, outside the app. It makes six unauthenticated requests (landing page, privacy policy, a server route, the sign-in service, the database API, an Edge Function) and fails if any does not give the status a healthy service gives. A failed run is the alert: GitHub notifies people watching the repository's Actions. Turn that on under GitHub **Settings > Notifications > Actions** ("Send notifications for failed workflows only").

It does not see slow responses, errors inside a signed-in session, or a scheduled job that stopped running. For the scheduled job use the queries above.
