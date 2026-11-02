# Web Hector + Alphonso Pro on the web: design

Status: draft for owner approval (2026-11-02). Brainstormed with the owner in the PR #337/#338 session; builder check done, its owner questions answered below.

## Intent

The web app earns nothing today. The owner wants **money coming in from the web within three months**.

There is almost no web traffic yet, so advertising cannot carry this: display ads pay a few dollars per 1,000 page views. The revenue lever is the subscription that already exists on iPhone, **Alphonso Pro**, whose one feature is **Hector**, the AI voice tutor. The web has no Hector page and no way to pay.

This project puts Hector on the web behind the same Pro subscription, bought on the web by card. A separate, later growth experiment (not this document) will send traffic to it.

The audience is the one the 2026-10-24 market brief recommended: adults at roughly B1-B2 who avoid workplace and job-interview conversations. Hector's conversation practice is that product.

## Goals

- A signed-in web learner can open **Hector**, talk with the microphone or type, and get spoken replies, as on iPhone.
- A learner without Pro sees a **paywall** that starts the **same free trial and price as App Store Alphonso Pro** and checks out by card on the web.
- **One subscription everywhere.** A web purchase unlocks Hector on iPhone too, and an App Store purchase unlocks Hector on the web.
- Every web paywall entry point is attributable (where it was opened from), so the growth experiment can measure trials by channel.

## Non-goals (this project)

- **Ads of any kind.** The owner allows only *rewarded* ads (watch one to earn a reward such as a heart), and only later, once there is traffic.
- **The traffic plan.** Search ads, the incentivized-traffic test, Reels and Reddit calls to action belong to a separate one-month test plan, written after this ships.
- **Changing what is free.** Lessons, review, Listen, leagues and **Practice** (scenarios and campaigns) stay free on the web under the existing daily AI quota, exactly as on iPhone. Pro = Hector only, on both platforms (owner decision).
- **Android billing, a separate web price, one-time packs.**
- **Cutting iOS build 52.** The iPhone changes below land in code; the owner decides when the build is cut.

## Anti-goals (a failure even if it technically works)

- **A paid feature reachable without paying.** Hector stays gated **on the server** (`/api/hector-respond` already returns 403 `not-entitled`). The web UI gate is only presentation.
- **Breaking App Store rules.** The iPhone app must not link to, mention or steer to web checkout (anti-steering). Web checkout exists only on the website.
- **Two sources of truth for "is Pro".** RevenueCat stays the only one.
- **Disclosure lagging behind reality.** A new payment processor (Stripe) is named in the privacy policy and terms before checkout goes live.

## Constraints and what exists

- **Entitlement:**
  - RevenueCat's `app_user_id` is the Supabase user id (iOS `Purchases.logIn(userID)`).
  - The server checks Pro via RevenueCat's REST API (`src/lib/revenuecat-entitlement.ts`, entitlement id `pro`, secret `REVENUECAT_SECRET_API_KEY`).
  - `hector-respond` returns 503 `entitlement-unavailable` or 403 `not-entitled`.
- **Hector server:** `POST /api/hector-respond` takes `{ text, history, course, cefr_level }` and returns the reply plus base64 Deepgram audio. Speech-to-text is `POST /api/stt`. Both already run the AI-consent check, the quota, the output filter and the safety preamble.
- **Web voice:** `src/lib/use-speech-capture.ts` already records the microphone for Practice and campaigns (`/converse/$scenarioId`, `/campaign/$campaignId`). The CSP allows `microphone=(self)`.
- **Security headers:** the CSP is strict (nonce scripts, `connect-src 'self'` plus Supabase, `frame-src` defaults to self). Anything embedded from a third party needs an explicit, tested policy change.
- **Copy:** the iOS paywall copy (`PaywallCopy` in `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PaywallPresentation.swift`: "Alphonso Pro", "Meet Hector, your AI tutor", "Start free trial", "Restore Purchases", "Manage Subscription"…) is the source for the web wording. Web and iOS strings that mean the same thing stay identical, following the existing consent-copy parity test pattern.
- **Attribution:** sign-up attribution exists (#330). The iOS paywall already sends a `paywall_source` attribute.
- **Platform:** TanStack Start on Vercel; OpenRouter (Claude Haiku 5.5) for AI text; Deepgram for speech.

## Decided by the owner

1. **One Alphonso Pro** shared across web and iPhone, paid on the web by card.
2. **Same price and free trial as the App Store.** Monthly, plus yearly if it is set up.
3. **Pro = Hector only**; Practice stays free on the web (daily AI limit), matching iPhone.
4. **Hector on the web is voice and text**: microphone like iPhone, with a type-instead fallback.
5. **Rewarded ads only, and later.**
6. **Account deletion cancels a web subscription, with no refund.** Deleting the account cancels the RevenueCat Web Billing (Stripe) subscription immediately, so the learner is never charged again; the current paid period is not refunded. Cancellation runs before the subscriber record is erased (`eraseSubscriberRecord` in `src/lib/account.functions.ts` and the maintenance path), and a failed cancel blocks the erase step and is retried, never silently skipped: an erased record with live billing is the failure this exists to prevent. The deletion confirmation and the terms say so. App Store subscriptions are unchanged (only the learner can cancel those, in Apple).
7. **One free trial per person across both platforms.** A learner who ever trialled or subscribed on the App Store sees "Subscribe", not "Start free trial", on the web, and the web checkout must not grant them a trial. `/api/pro-status` therefore also returns trial eligibility from the RevenueCat subscriber's history. If the hosted checkout cannot withhold the trial per user, the builder uses a second, no-trial offering for those learners.
8. **Pro gets its own Hector daily allowance.** Pro learners' Hector turns count against a separate, larger daily cap, not the free "chat" quota that Practice uses, so practising never blocks the paid feature. It is still capped to bound AI cost (the builder proposes the number from current per-turn cost; owner confirms before launch). This is a server change in `ai-quota.server.ts` and `/api/hector-respond`, so iPhone gets it with no build.
9. **iPhone changes are in scope** (shipping in build 52, which the owner cuts): for a learner whose Pro comes from web billing, the iPhone's "Manage Subscription" opens the web customer portal page instead of Apple's subscription screen, which would not show it. The iPhone must still never mention web prices or link to web checkout; it only routes an existing web subscriber to manage what they already bought (the builder confirms this with App Review guideline 3.1.1/3.1.3 wording and keeps it out of the paywall).

## Decided by me (owner can override)

- **Checkout: RevenueCat Web Billing through a hosted Web Purchase Link** (RevenueCat's checkout page, on Stripe), opened with the learner's Supabase user id as `app_user_id`.
  - This was chosen over embedding RevenueCat's `purchases-js` SDK because the hosted page needs no CSP change for Stripe frames and scripts, and puts no card form on our origin.
  - The cost is a redirect off-site and back. If conversion data later says the redirect hurts, an embedded checkout is a follow-up.
- **Manage and cancel:** the web shows "Manage Subscription". For web-billed subscribers it links to RevenueCat's customer portal. For App Store subscribers it shows "Manage it in your iPhone's Settings" (a web page cannot open iOS settings).
- **After checkout:**
  - The return page re-checks entitlement on the server until Pro is active, for up to about 30 s.
  - It then opens Hector.
  - If entitlement is still not active, it says "Payment received, activating…" with a retry, and never "failed".
- **A new read-only endpoint** (for example `GET /api/pro-status`) returns `{ pro: boolean, store: "app_store" | "web" | null }` from the same server check. It is used for the UI gate and the manage link. It fails closed (not Pro) when RevenueCat is unreachable, and shows a "couldn't check, try again" state rather than a paywall.
- **Legal pages stay steering-free.** The iPhone app links to `/terms`, `/privacy` and `/support`. Those pages get no Hector or checkout link in their navigation and no prices; they name Stripe and describe web billing in neutral terms. A guard test pins that the legal pages contain no link to Hector, the paywall or checkout.
- **The web price comes from RevenueCat, never typed in.** The paywall shows the price and trial of the RevenueCat web offering (fetched server-side, in its own currency); if it cannot load, the paywall shows no price and a retry, never a guessed number. The hosted checkout shows the final price.
- **Entry points:**
  - a **Hector** item in the web navigation;
  - a Hector invitation card in Practice (the iOS `practiceCard` equivalent);
  - a "Continue with Hector" prompt at the end of a Practice conversation.

  Each sends its own `paywall_source`, matching the iOS values where one exists.

## Left to the builder

- Page layout and component structure, reusing the app's existing visual language (Canopy theme) and the Practice conversation UI where it fits.
- How conversation history is held client-side for `history` (same shape as iOS), and turn limits (follow iOS).
- The exact polling interval and back-off on the post-checkout page.
- Test structure, following the repo's habits: route tests, copy-parity tests, a guard that `/api/hector-respond` is never callable without the entitlement check, and mutation checks.

## Owner prerequisites (outside the code)

1. **Stripe:** create or connect a Stripe account to RevenueCat Web Billing (RevenueCat → Project → Web).
2. **RevenueCat:** create the web products and offering at the **same price and trial** as the App Store product, attach the `pro` entitlement, and create the Web Purchase Link. The builder needs the link's URL.
3. **Tax and business:** with Stripe, the owner (not Apple) is the seller for web sales and handles sales tax (for example GST/HST in Canada). Decide whether to turn on Stripe Tax before launch.
4. **Legal text:** approve the privacy-policy and terms additions naming Stripe (and RevenueCat Web Billing) for web payments, plus the web cancellation and refund wording.

## Success check (three months)

Money coming in: at least one web-billed Pro subscription that renewed after its trial. The growth experiment will measure trials and paid conversions per channel; this project only has to make them measurable.
