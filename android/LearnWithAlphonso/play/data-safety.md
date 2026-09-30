# Google Play Data safety answers

Derived from the App Store declaration in `ios/LearnWithAlphonso/PrivacyInfo.xcprivacy`
and `Hackaton/Shipaton/03-submission-materials/privacy-nutrition-labels.md`
(the code is the source of truth; those documents were written from it).
The Android app talks to the same backend and adds nothing: no analytics,
advertising or crash SDK; Firebase is used for Cloud Messaging only.

## Overview questions

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | Yes | Everything below |
| Is all of the user data collected by your app encrypted in transit? | Yes | HTTPS to Supabase, the API and Deepgram; no cleartext traffic |
| Do you provide a way for users to request that their data is deleted? | Yes | In-app account deletion (Settings, Delete My Account) and https://learn.alphonsoecosystem.app/profile |
| Does your app share data with third parties? | Yes, for the rows marked Shared | Audio to Deepgram and the voice service for transcription; nothing sold, nothing for ads |

## Data types

Every row is Collected, Required (the app cannot function without it), not used for advertising, and Linked to the account; there is no anonymous mode.

| Play category | Data type | Collected | Shared | Purpose | Ephemeral | Source of truth |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info | Name | Yes | No | App functionality | No | `profiles.display_name`, shown on leaderboards |
| Personal info | Email address | Yes | No | App functionality, account management | No | Supabase auth, the only account identifier |
| Personal info | User IDs | Yes | No | App functionality | No | Supabase `user_id` on every row |
| Audio | Voice or sound recordings | Yes | Yes (processing only) | App functionality | Yes | Speaking practice and Hector send audio to Deepgram and the voice service; nothing stored server-side |
| Messages | Other in-app messages | Yes | Yes (processing only) | App functionality | No | Practice and Hector transcripts sent to the AI provider; typed translation answers graded server-side |
| App activity | App interactions | Yes | No | App functionality, personalisation | No | Lesson completions, XP, streaks, reviews, podcast positions and play events, duels, leaderboards |
| App activity | Other user-generated content | Yes | No | App functionality | No | Display name, avatar seed, team names |
| Financial info | Purchase history | Yes | Yes (RevenueCat) | App functionality | No | Pro subscription state through RevenueCat and Google Play Billing |
| Device or other IDs | Device or other IDs | Yes | No | App functionality | No | The FCM push token in `device_tokens`; a per-install UUID for the tutor service's rate limiting (never a hardware id) |

## Not collected (answer No)

Location, contacts, calendar, photos and videos, files and documents, health and fitness, web browsing history, installed apps, SMS or call logs, financial account details (Google handles payment), crash logs and diagnostics (no crash SDK), advertising ID (never read).

## Security practices

- Encrypted in transit: yes.
- Deletion: yes, in-app and on the website.
- Independent security review: no.
- Committed to the Play Families policy: not applicable; the app is not designed for children.
