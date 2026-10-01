# Play Console: App access and review notes

Play asks, under App content, App access, whether any part of the app is
restricted. The answer is Yes: everything past the sign-in screen needs an
account, and Hector needs the Pro subscription. Adapted from
`scripts/update-app-review-info.ts` with the wording Play's form actually
needs (it has no "notes" free text like App Store Connect; instructions go
into the credential entry itself).

## Instructions to add (App access, Add new instructions)

- Name: Demo learner account (sign-in by email code)
- Username: the demo account email held in the `DEMO_ACCOUNT_EMAIL`
  repository secret; never write it here (this repository is public).
- Password: leave blank, and put this in Other instructions:

  "Sign-in is passwordless. Enter the email above on the sign-in screen and
  tap Continue with email. The one-time code is delivered to that mailbox;
  the reviewer inbox forwarding is set up so the code arrives within a
  minute. The demo account is pre-placed at level B2 and holds an active
  Alphonso Pro entitlement (granted through RevenueCat, see
  `.github/workflows/grant-demo-entitlement.yml`), so the Hector tab opens
  without a purchase."

## What a reviewer will meet, in order

1. Sign in with the demo email and the emailed code.
2. Learn tab: CEFR bands, lessons, the review row. Any lesson runs end to end; speak questions ask for the microphone on first use and fall back to typing if denied.
3. Listen tab: podcast folders, an episode plays with the screen locked and shows lock-screen controls; the download icon stores an episode for offline use.
4. Practice tab: scenarios and campaigns use the microphone; the first AI screen shows the AI disclosure sheet once.
5. Hector tab: opens directly for the demo account; for any other account it shows the paywall with a Google Play test purchase.
6. Profile tab: leaderboard, friends, teams, achievements, settings including Export my data and Delete my account (typed DELETE confirmation).

## Content rating (IARC questionnaire)

Education app. No violence, sexual content, profanity, controlled substances, gambling or user-to-user unmoderated content beyond display names, which are filtered server-side and reportable in-app (block and report on every user row). Users can interact (friends, teams, duels) and share display names; no location sharing. Expected rating: Everyone / PEGI 3.

## Other declarations

- Ads: No.
- Target audience: 13 and over (not designed for children).
- News app: No. COVID-19 app: No. Government app: No.
- Financial features: No (a subscription through Google Play Billing is not a financial feature).
- Health: No.
- Account deletion URL: https://learn.alphonsoecosystem.app/profile
