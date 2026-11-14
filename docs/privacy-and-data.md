# Privacy and data: what the build 62 features keep

Written 2026-11-13 for main at #498. The learner-facing policy is `src/routes/privacy.tsx` (and `cookies.tsx`); this file is the engineering inventory behind it, for the features added since build 61: what is kept, why, for how long, whether it is in the data export, and what happens when the learner deletes the account. The export is `src/lib/account.functions.ts` (every table with a `user_id` column must be listed there or in its `NOT_PERSONAL_DATA` set, and a test fails if a table is missing); deletion relies on `ON DELETE CASCADE` on every user-scoped table.

Where this file and the code disagree, the code wins; fix this file.

## Optional usage analytics (PostHog, #489)

| | |
| --- | --- |
| **What** | A short list of product events (`app_open`, `onboarding_step`, `sign_in_completed`, `lesson_started`, `lesson_completed` with a score band, `practice_call_started` and `completed` with the scenario and stars, `podcast_played` and `completed`, `video_started` and `video_completed` (video id and course only), `hector_opened`, `paywall_viewed`, `purchase_started`; `explain_requested` and `path_built` are reserved and not sent). Each event allows only listed properties, and a value is kept only if it is a short identifier or a small number, so emails and free text are dropped. Campaign scene calls are not tracked. |
| **Identity** | Anonymous: `identify` is never called, so no name, email or account id. A random per-install id is kept (web: localStorage; apps: the SDK's own store). `person_profiles` is `identified_only`, so no person profile is created. |
| **Never** | Autocapture, screen or lifecycle capture, page views, session replay, surveys, feature flags. |
| **Consent** | Off by default everywhere. Nothing is loaded, created or sent before the learner agrees: web via the cookie banner ("Accept all" includes anonymous usage data, "Essential only" does not) or the Settings switch "Share anonymous usage data"; iOS and Android via a neutral two-button step at the start of the after-sign-in flow (only in builds that carry a key and only if not answered yet) plus the same Settings switch. Browsers that send Do Not Track are respected. Devices of learners under 13 never send, even with a stored opt-in. |
| **Why** | To see which features are used so lessons and screens can be improved. Not used for advertising and not shared with anyone for ads. |
| **Where** | PostHog, United States region (`us.i.posthog.com`), as a service provider acting on our behalf. The project key is never committed: web `VITE_POSTHOG_KEY`, iOS `Info.plist` `PostHogKey` and Android `BuildConfig` from the `POSTHOG_PROJECT_KEY` secret. |
| **Retention** | Set in the PostHog project's settings, not in this repo. **Not verified here**; the owner should confirm the project's retention and write it in the policy. |
| **Export** | Not in the account export: the data carries no account id, so it cannot be tied to an account. |
| **Deletion** | Turning the switch off resets the anonymous id and stops sending at once. Deleting the account cannot reach PostHog data because it is not linked to the account; opting out first is the way to stop it. |
| **Store labels** | iOS `PrivacyInfo.xcprivacy`: Device ID gains the Analytics purpose (Product Interaction already had it). Play: `android/LearnWithAlphonso/play/data-safety.md` is updated. The App Privacy answers in App Store Connect and the Play Data safety form must match; **owner to do** (listed in the owner to-do). |

## Explain in my language (#488)

| | |
| --- | --- |
| **What** | When the learner taps "Explain in <language>" (or "Say that in <language>"), the item text goes to the model provider: the wrong answer and its question, the word, or the Practice or Hector message. The native language is read from the account, never from the request. |
| **Why** | A short explanation in the learner's own language. |
| **Where** | Anthropic (Claude) through OpenRouter, like the other AI features; the provider does not train on it and deletes it within 30 days (the policy page says so). Gated by AI consent and the owner's AI switch. |
| **Kept by us** | `explanation_cache`: the generated explanation per (kind, course, language, item), keyed by a SHA-256, **no user id and no learner text**; shared between learners; service role only. The per-user quota counter is `ai_usage` (a count per kind per day), which is in the export and cascades on deletion. The learner's mode is `user_metadata.learner_profile.explainMode`. |
| **Retention** | The cache has no expiry; it holds item explanations, not personal data. Quota counters follow the existing `ai_usage` rules. |
| **Export and deletion** | `ai_usage` and the profile metadata are in the export and removed with the account. The cache has nothing to export or delete. |
| **Store labels** | AI requests that send learner text to a provider belong in the App Privacy and Play Data safety answers (user content). **Owner to confirm** they cover Explain as well as Hector. |

## The staff action record (#496)

| | |
| --- | --- |
| **What** | `staff_audit_log`: for every staff action, the actor's id and role, the action name, the target learner's id, a required reason, and the before and after values the action changed (no payment details, answers, chats, or note text: a note is recorded by its id and length). Viewing a learner's page records `user.view` before any facts are returned. Also `user_restrictions` (block or ban, reason, who lifted it), `pro_grants` (each gifted Pro period), `staff_notes` (internal notes) and `staff_roles`. |
| **Why** | Accountability: who did what to whose account, and why. Staff can see a learner's facts only through scoped, recorded functions. |
| **Retention** | The action record is append-only and has no deletion path (a trigger refuses UPDATE, DELETE and TRUNCATE) and no expiry; it holds ids and short reasons, not learner content. A retention period is an owner decision and has not been set. |
| **Export** | The learner's own `user_restrictions` and `pro_grants` rows are in the export. `staff_notes` and the action record are not (internal records; the record can contain other people's reasons). |
| **Deletion** | `user_restrictions`, `pro_grants`, `staff_notes` and `staff_roles` cascade with the account. `staff_audit_log` has no foreign keys on purpose: its rows outlive the learner and the staff member, and keep only ids. Account deletion by staff is itself recorded (`user.delete`, and `user.delete.failed` per failed step). |
| **Staff access** | Roles `owner` and `support` with named scopes; owners may manage staff and never their own row; `ADMIN_REQUIRE_AAL2=true` requires a second factor on every staff session. |

## Time zone and the learner's local day (#472, #497)

| | |
| --- | --- |
| **What** | The learner's IANA time zone (for example `Europe/Paris`) in `learner_time_zones`, sent by the app. |
| **Why** | Since #497 it is the day boundary for streaks and daily activity (before that, it was only used to show dates). UTC is used when no zone is known or the database does not know it. The weekly league, quests, seasons and team missions deliberately stay on one shared UTC week. |
| **Retention** | Until the account is deleted. |
| **Export and deletion** | In the export; cascades on account deletion. |
| **Policy text** | `src/routes/privacy.tsx` still says the time zone is "used only to show dates". **That sentence is now out of date** and needs a one-line change (streaks and daily totals follow your time zone). It is a source file, so it was not changed in this docs pass; it is in the backlog. |

## Podcast quiz review items (#487)

A missed podcast question is stored as a `review_items` row (prompt, choices, answer index, the correct answer as the explanation) so it comes back in spaced review. It is the learner's own row, in the export, removed with the account, written only by `submit_podcast_quiz`.

## Watch shelf video progress (#499)

| | |
| --- | --- |
| **What** | Per video the learner opens: how many seconds in they are (`progress_seconds`), when they finished it (`completed_at`) and when it last changed (`updated_at`), in `video_watches`. The videos themselves (`videos`) are the same for everyone and hold no personal data. |
| **Why** | To resume where they stopped, to mark a video finished and to place videos on Your learning path. |
| **Written by** | Only `save_video_progress`, for the signed-in caller and only a published video. Clients have SELECT and DELETE on their own rows and no INSERT or UPDATE. |
| **Export** | In the export (`video_watches` is listed in `src/lib/account.functions.ts`). |
| **Deletion** | `ON DELETE CASCADE` on `user_id`, so account deletion removes it; a learner can also delete their own rows. |
| **Analytics** | `video_started` and `video_completed` carry only `video_id` and `course`, anonymous and only after the learner opted in (see the first section). |
| **Policy text** | `src/routes/privacy.tsx` lists video progress with the listening positions. |

## Help chat (milestone 1 of the support work: data and server)

| | |
| --- | --- |
| **What** | What the learner writes in Help and is answered (`support_messages`: the text, who wrote it as learner, ai, staff or system, the time), their conversation (`support_conversations`: status, channel, a topic from a fixed list, why it went to a person, a short AI summary of up to 600 characters, who it is assigned to), and internal staff notes (`support_notes`, a separate table). On every AI turn we also keep the exact facts snapshot the AI saw (`ai_facts`): Pro active and source, course and level, streak, days active in the last 30, lessons in the last 7, platforms, whether social features are blocked (yes or no, never why), and up to 3 previous tickets as status, topic and day. Never in it: email, name, user id, notes, gift or restriction reasons, reports, payment details, lesson answers, chats with Alphonso or Hector. |
| **Why** | To answer a learner's question in the app, and to let a person pick it up with the context the AI had. |
| **Where it goes** | The learner's messages and the facts snapshot go to the AI provider (Anthropic through OpenRouter, like the other AI features; not used for training) only while AI answers are on (`app_switches` key `support_ai`, OFF at launch), the learner has given AI consent, and the message is not one of the topics that always go to a person (refunds and billing disputes, deleting an account, safety and abuse, legal and privacy requests, a request for a person). |
| **Written by** | Only server functions (`support_*`, SECURITY DEFINER). Clients and even the service role cannot insert, update or delete rows directly. Messages are append-only (a trigger refuses UPDATE and TRUNCATE; DELETE only for retention or when the account or conversation is already gone). |
| **Limits** | 50 learner messages a day in total, 100 per conversation; 30 AI answers a day and 5 a minute (quota kind `support`); one open conversation per learner. |
| **Staff access** | Staff with `support.read` see a ticket list with no learner name or email, and a ticket with the whole conversation (the AI part included), the AI summary and the same facts snapshot the AI saw. Opening a ticket is written to the action record (`user.view`, the learner as target). Replies, assignment, status changes and internal notes are written to the action record in the same transaction as the change, with ids and the status change only, never the message or note text. Conversations still with the AI are not visible to staff. |
| **Retention** | Planned (milestone 6): solved conversations are deleted 12 months after they were solved. Not yet running. |
| **Export** | `support_conversations` and `support_messages` are in the export with explicit columns that leave out `assigned_to`, `ai_summary`, `handoff_reason`, `ai_facts`, `author_id` and `client_id`. `support_notes` is never exported (internal). |
| **Deletion** | `ON DELETE CASCADE` from the account removes conversations, messages and notes. |
| **Logs** | The server logs an event name, outcome, hand-off reason, status code, quota result and message length only: no user id, no conversation id, no text. A failing provider is logged by status only. |
| **Policy text** | `src/routes/privacy.tsx` does not yet describe the Help chat. **Owner to approve a wording change before the chat ships to learners.** |

