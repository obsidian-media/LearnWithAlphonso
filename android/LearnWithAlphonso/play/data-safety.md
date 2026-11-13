# Google Play Data safety answers

Derived from the App Store declaration in `ios/LearnWithAlphonso/PrivacyInfo.xcprivacy`
and the App Store privacy-label answers (the code is the source of truth;
those answers were written from it).
The Android app talks to the same backend and adds two SDKs: Sentry crash
reporting (release builds only, scrubbed, no replay or screenshots; see
`CrashReporting.kt`) and PostHog usage analytics (optional, off until the learner
chooses it, anonymous, no replay; see `Analytics.kt`). No advertising SDK; Firebase is used for Cloud Messaging only.

## Overview questions

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | Yes | Everything below |
| Is all of the user data collected by your app encrypted in transit? | Yes | HTTPS to Supabase, the API and Deepgram; no cleartext traffic |
| Do you provide a way for users to request that their data is deleted? | Yes | In-app account deletion (Settings, Delete My Account) and https://learn.alphonsoecosystem.app/profile |
| Does your app share data with third parties? | Yes, for the rows marked Shared | Audio to Deepgram and the voice service for transcription; nothing sold, nothing for ads |

## Data types

Every row is Collected, Required (the app cannot function without it), not used for advertising, and Linked to the account; there is no anonymous mode. The two App info and performance rows (Sentry crash logs and diagnostics) are the exception: they carry no account id, so they are not linked to it.

| Play category | Data type | Collected | Shared | Purpose | Ephemeral | Source of truth |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info | Name | Yes | No | App functionality | No | `profiles.display_name`, shown on leaderboards |
| Personal info | Email address | Yes | No | App functionality, account management | No | Supabase auth, the only account identifier |
| Personal info | User IDs | Yes | No | App functionality | No | Supabase `user_id` on every row |
| Audio | Voice or sound recordings | Yes | Yes (processing only) | App functionality | Yes | Speaking practice and Hector send audio to Deepgram and the voice service; nothing stored server-side |
| Messages | Other in-app messages | Yes | Yes (processing only) | App functionality | No | Practice and Hector transcripts sent to the AI provider; typed translation answers graded server-side |
| App activity | App interactions | Yes | No | App functionality, personalisation, analytics | No | Lesson completions, XP, streaks, reviews, podcast positions and play events, duels, leaderboards. Analytics purpose: the optional PostHog events (which features are used: lesson started or finished with level and score band, practice call, podcast played, Hector or paywall opened, first-run step); PostHog is a service provider acting on our behalf, nothing is shared for ads |
| App activity | Other user-generated content | Yes | No | App functionality | No | Display name, avatar seed, team names |
| Financial info | Purchase history | Yes | Yes (RevenueCat) | App functionality | No | Pro subscription state through RevenueCat and Google Play Billing |
| App info and performance | Crash logs | Yes | No (Sentry is a service provider acting on our behalf, not a third party we share with) | App functionality | No | Sentry, release builds only: stack trace, app version, device model and OS version; emails, tokens and user identity are removed before sending (`CrashReportingTest`) |
| App info and performance | Diagnostics | Yes | No | App functionality | No | The same Sentry report (memory, device state at the time of a crash); no tracing or performance sampling |
| Device or other IDs | Device or other IDs | Yes | No | App functionality, analytics | No | The FCM push token in `device_tokens`; a per-install UUID for the tutor service's rate limiting (never a hardware id); analytics purpose: the random per-install id PostHog keeps, only after the learner opts in, reset when they turn it off |

## Not collected (answer No)

Location, contacts, calendar, photos and videos, files and documents, health and fitness, web browsing history, installed apps, SMS or call logs, financial account details (Google handles payment), advertising ID (never read).

## Security practices

- Encrypted in transit: yes.
- Deletion: yes, in-app and on the website.
- Independent security review: no.
- Committed to the Play Families policy: not applicable; the app is not designed for children.
