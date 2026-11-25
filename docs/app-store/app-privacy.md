# App Store Connect: App Privacy answers (iOS)

Written 2026-11-18 from the code at main (build 71 candidate); status section added 2026-11-22. The source of truth is
`ios/LearnWithAlphonso/PrivacyInfo.xcprivacy`, pinned one-to-one by `src/lib/ios-privacy-manifest.test.ts`; enter the
rows below in App Store Connect > App Privacy exactly as listed. Cross-checked against `src/routes/privacy.tsx`,
`src/lib/app-store/review-notes.ts` and `android/LearnWithAlphonso/play/data-safety.md`.

## Status (verified 2026-11-22 against d8350542, build 72; delta check 2026-11-25 against 236cb8f1, build 73, last bullet)

- The 13 data-type rows below match `ios/LearnWithAlphonso/PrivacyInfo.xcprivacy` one-to-one (type, linked flag, purposes); tracking is false with no tracking domains.
- Privacy Policy URL is `https://learnwithalphonso.com/privacy` (`PRIVACY` in `src/lib/app-store/listing-copy.ts:23`; returns HTTP 200 on 2026-11-22).
- Sentry "Prevent Storing of IP Addresses" owner step is done (`docs/sentry-crash-reporting.md`, owner step 1).
- Mismatch 5 (time zone) is resolved. Mismatches 2, 3 and 4 are still open (see Cross-check result).
- Entering these answers in App Store Connect is still the owner's step.
- Delta check 2026-11-25 (main 236cb8f1, build 73): `PrivacyInfo.xcprivacy` was not touched by #709 to #717 (diff 7fecee42..236cb8f1 has no change to it), so the rows stay valid. The web-only `voice_playback_failed` event carries a surface, a reason and a browser error name (no text, no user data) and is sent only with analytics opt-in (#716). Review notes in `src/lib/app-store/review-notes.ts` name OpenRouter (not NVIDIA) and "crash reports via Sentry; usage analytics via PostHog only if the learner opts in" and are held under the 4000-character limit by `review-notes.test.ts` (`NOTES_LIMIT`); the owner reports the same change was applied in App Store Connect on 2026-11-22 (not re-read from there). The description in `src/lib/app-store/listing-copy.ts` does NOT yet have the stories and Say the picture / Say it right paragraphs that the owner added in App Store Connect (open item: sync the file before any listing push).

## Top-level answers

| Question                                                                                  | Answer                         | Evidence                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do you or your third-party partners collect data from this app?                           | Yes                            | Table below                                                                                                                                                                                                                |
| Used to track you (linked with third-party data for advertising, or shared with brokers)? | **No, for every type**         | `NSPrivacyTracking` false, no tracking domains; no `AdSupport`, `AppTrackingTransparency` or `ASIdentifierManager` anywhere (probe in `ios-privacy-manifest.test.ts`); no `NSUserTrackingUsageDescription`; no ad SDK |
| Privacy Policy URL                                                                        | https://learnwithalphonso.com/privacy | `src/lib/app-store/listing-copy.ts` (`PRIVACY`), `src/routes/privacy.tsx`                                                                                                                                                                              |

Not collected (answer No): precise or coarse location from the device (the country is a choice the learner makes in
first-run, so it is "Other Data", not Location), contacts, photos or videos, health and fitness, sensitive info,
browsing or search history, advertising data, financial info other than Apple purchases.

## Data types to declare

All rows: **not used for tracking**. "Linked" means the row is keyed to the Supabase user id.

| ASC category | Data type             | Linked to identity | Purposes                                              | What it is in the code                                                                                                                                                                                                                                  |
| ------------ | --------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info | Name                  | Yes                | App Functionality                                     | Public display name (`profiles.display_name`, shown on leaderboards); the Apple given name pre-fills it; optional first name the tutors use                                                                                                              |
| Contact Info | Email Address         | Yes                | App Functionality                                     | Sign-in identifier (email code, Apple, Google); Apple may give a private relay address                                                                                                                                                                  |
| User Content | Audio Data            | Yes                | App Functionality                                     | Speaking practice and Hector audio to Deepgram (`/api/stt`) for transcription; not stored by us                                                                                                                                                         |
| User Content | Customer Support      | Yes                | App Functionality                                     | Help chat with Miya (AI, always labelled) and staff: messages, replies, topic, status (`/api/support/*`). Solved chats are deleted 12 months after solving; all deleted with the account; in the data export                                              |
| User Content | Other User Content    | Yes                | App Functionality                                     | AI chat turns (Hector, practice, campaigns), written translation answers, saved words, team names, reports of AI replies and users (`content_reports`)                                                                                                   |
| Identifiers  | User ID               | Yes                | App Functionality                                     | Supabase `user_id` on every row; RevenueCat app user id                                                                                                                                                                                                 |
| Identifiers  | Device ID             | Yes                | App Functionality, Analytics                          | APNs push token (`device_tokens`); the analytics purpose is the random per-install id PostHog keeps, only after opt-in                                                                                                                                   |
| Usage Data   | Product Interaction   | Yes                | App Functionality, Analytics, Product Personalization | Lessons, XP, streaks, reviews, podcast progress; due-review and weak-word queues (personalization); optional PostHog feature events (analytics)                                                                                                          |
| Purchases    | Purchase History      | Yes                | App Functionality                                     | Pro subscription state via StoreKit and RevenueCat; no payment details reach us                                                                                                                                                                         |
| Other Data   | Other Data Types      | Yes                | App Functionality                                     | First-run answers (age range, never a birth date; native language; goal; country; level; daily minutes; interests; how they heard of us), 13+ confirmation for study-buddy matching, AI consent record, learning minutes and skill counts, time zone, daily AI-request counts |
| Diagnostics  | Crash Data            | **No**             | App Functionality                                     | Sentry, release builds only (below)                                                                                                                                                                                                                     |
| Diagnostics  | Performance Data      | **No**             | App Functionality                                     | Server timing logs for AI requests, no account id                                                                                                                                                                                                       |
| Diagnostics  | Other Diagnostic Data | **No**             | App Functionality                                     | Server failure details with no account id; the same Sentry report                                                                                                                                                                                       |

## SDK and service facts behind the answers

- **PostHog (usage analytics).** `Analytics.swift` + `AnalyticsTracker` in the Kit: nothing is created, started or sent
  until the learner opts in (first-run step or Settings > Share anonymous usage data); turning it off resets the id and
  stops sending; never on a device that answered Under 13; `identify()` is never called, `personProfiles = .never`; no
  autocapture, screen views, lifecycle events, session replay, surveys or feature flags; only the allow-listed
  `AnalyticsEvent` properties (never a typed answer, chat or audio). The key is injected at build time (Info.plist
  `PostHogKey`); without it the feature is off. It is declared as Analytics under Device ID and Product Interaction, and
  those types are answered "Linked" because the same types are also collected first-party for app functionality;
  PostHog data itself is anonymous.
- **Sentry (crash data).** `CrashReporting.swift`: release builds only; `sendDefaultPii = false`, `event.user = nil`,
  install id, device name and app hash removed, no screenshots, view hierarchy, replay, tracing, sessions, network
  breadcrumbs or failed-request capture; emails, UUIDs, JWTs and tokens scrubbed from remaining text; does not start
  (and closes) on an Under-13 device. So Crash Data is **not linked** and not for tracking. Retention 90 days (privacy
  page).
- **RevenueCat / StoreKit.** App user id plus purchase and renewal info from Apple; no payment details. Purchase History.
- **Deepgram, OpenRouter (Anthropic).** Processors for audio and AI text, only after the learner taps Allow on the AI
  consent sheet; already covered by Audio Data, Other User Content and Customer Support above.
- **Cloudflare Turnstile (third-party partner).** Bot check in a small web view on the email sign-in screen; Cloudflare sees
  the IP address and device and browser signals for that check only, to stop automated sign-ups. It is a service provider
  acting on our behalf, not used for tracking or ads. ASC has no fraud-prevention purpose; it falls under Diagnostics at
  most. See mismatch 3.
- **Not present:** ad networks, IDFA, an ATT prompt, location, contacts, photos, HealthKit. The widget manifest collects
  nothing (`UserDefaults` 1C8F.1 only).

## Cross-check result

Agreement: the manifest, the privacy page, the Play data-safety doc and the review notes agree on no tracking, no ad
SDK, Sentry not linked, PostHog opt-in and anonymous, RevenueCat for purchases, and Under-13 blocking analytics and
crash reports.

Mismatches found (no legal page was changed; listed for the owner):

1. The manifest had no Customer Support type although the Help chat stores messages (the privacy page and the Play doc
   both declare it). Fixed in this PR: `NSPrivacyCollectedDataTypeCustomerSupport` added and pinned in the test.
2. Wording: `privacy.tsx` says the PostHog data "is not linked to your account", while the manifest and this sheet
   answer Device ID and Product Interaction as Linked. Not contradictory (the types are linked for first-party use;
   PostHog itself is anonymous), but the owner may want one sentence on the page saying so. Play also says Linked.
3. Cloudflare Turnstile is described on the privacy page and the Play doc (Diagnostics, fraud prevention) but is not
   named in the iOS manifest; it is covered under Other Diagnostic Data. Left as is.
4. `review-notes.ts` does not mention the Help chat or Miya (it says "Report an AI reply: press and hold, then Report
   this response", which now also holds for Miya's replies). The notes are near the 4000-character limit; add a short
   Help chat line only if App Review asks.
5. Resolved (2026-11-22): time zone is listed under Other Data Types and `src/routes/privacy.tsx` now describes it
   (used to show dates and to decide which calendar day streaks and daily totals count towards; UTC if absent).

## Owner step before answering Crash Data as not linked (done)

Done by the owner per `docs/sentry-crash-reporting.md` (owner step 1: Data Scrubber and Prevent Storing of IP Addresses on in all three projects). For reference, in the Sentry project `learnwithalphonso-ios`, Settings > Security & Privacy: turn ON "Prevent Storing of IP Addresses" (and Data Scrubber).
The code removes the user, device name and install id, but Sentry derives an IP from the request unless this setting is on; the
"not linked" answer depends on it.
