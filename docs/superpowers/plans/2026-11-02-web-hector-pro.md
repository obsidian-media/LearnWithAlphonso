# Web Hector + Alphonso Pro on the web: Implementation Plan

> Status (2026-11-04): implemented and merged (#339).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learners can talk with Hector on the web after subscribing to the same Alphonso Pro as iPhone. They pay by card through RevenueCat Web Billing on Stripe.

**Architecture:** RevenueCat stays the only source of truth for Pro. The server reads one RevenueCat subscriber summary, which feeds:

- `/api/pro-status` (Pro, which store, trial eligibility, management link);
- `/api/pro-offering` (price and the purchase link);
- the existing Hector gate.

The web Hector page reuses `/api/hector-respond`, `/api/stt` and `useSpeechCapture`. Checkout is RevenueCat's hosted Web Purchase Link, so no card form and no CSP change. Account deletion cancels web billing before the subscriber record is erased. The iPhone only changes how "Manage Subscription" behaves for web subscribers.

**Tech Stack:** TanStack Start (React) on Vercel, Supabase (Postgres RPC quotas), RevenueCat REST (v1 subscribers, plus v2 where Task 0 says so), SwiftUI plus LearnWithAlphonsoKit, Vitest, Deno.

**Spec:** `docs/superpowers/specs/2026-11-02-web-hector-pro-design.md` (approved 2026-11-02). Read it first. Owner decisions 1-9 are binding.

## Global Constraints

- **Pro = Hector only.** Practice stays free under the existing `chat` quota. Never add a Pro check to Practice routes.
- **Server gate.** `/api/hector-respond` keeps its consent → entitlement → quota order. The UI gate is presentation only.
- **One source of truth.** Every Pro decision comes from RevenueCat via `src/lib/revenuecat-entitlement.ts`. No Stripe SDK, no Stripe keys in code, no Stripe webhooks.
- **Fail closed.** If RevenueCat is unreachable, nothing unlocks. The UI shows "Couldn't check your subscription. Try again." and never a paywall.
- **No typed prices.** Every price shown comes from the RevenueCat web offering. If it fails to load, show no price.
- **One trial per person.** If a learner has any App Store or web subscription history, the page says "Subscribe" and links to the no-trial checkout.
- **No refund on deletion.** Deleting the account cancels web billing immediately with no refund. A failed cancel never lets the erase step or the retry window drop the record silently.
- **No steering.** The iPhone app never shows a web price or checkout link. `/`, `/terms`, `/privacy`, `/support`, `/cookies` and `/accessibility` contain no link to `/hector`, `/pro-return` or the purchase link, and no price.
- **Copy matches iOS.** Web copy that means the same as iOS `PaywallCopy` is identical, enforced by a parity test like `src/lib/ai-consent-copy-parity.test.ts`.
- **Paywall sources** reuse the iOS values: `hector_tab`, `hector_not_entitled`, `practice_hector_card`. The new web-only one is `practice_end_prompt`.
- **No build cut.** iOS changes land in code only. The owner cuts build 52.
- **Migrations:** version `20261102120000` or later. A `CREATE OR REPLACE` must keep every existing limit (`chat` 60, `stt` 300, `tts` 80, `translate` 60, `define` 40; per minute 10 / 10 / 15 / 10 / 10). Read the latest definitions in `supabase/migrations/20261005120000_saved_word_review_items.sql` before writing.
- **Never print or commit** a RevenueCat or Stripe key.
- **Branch:** `feat/web-hector-pro`, from `docs/web-hector-pro-design`. Squash-merge on green CI.

## Review Focus

1. **Paying during an outage.** The learner has just paid but RevenueCat has not activated Pro yet. `/pro-return` must say "Payment received, activating…" with a retry, never a failure and never the paywall again. Pinned in Task 5.
2. **A free user who hits `/api/hector-respond` directly** still gets 403 and spends no quota. They must not reach the new `hector` kind. Pinned in Task 2.
3. **A deleted account with a failed cancel.** The pending row survives past `ERASURE_RETRY_WINDOW_MS` and logs on every run. Pinned in Task 3.
4. **An App Store Pro learner on the web** sees Hector unlocked, no paywall, and "Manage it in your iPhone's Settings". A web Pro learner on iPhone opens the web management page, not Apple's sheet. Pinned in Tasks 1, 5 and 7.
5. **The microphone is denied or unavailable.** The page offers typing; one failure never leaves it unanswerable. This is `useSpeechCapture`'s sticky error. Pinned in Task 5.

---

### Task 0: Confirm RevenueCat Web Billing facts in the sandbox (no product code)

The plan depends on five RevenueCat behaviours that must be observed, not assumed. Prerequisite (owner):

- Stripe **test mode** is connected in RevenueCat → Web Billing;
- a web product is set up at the App Store price, with and without a trial, attached to entitlement `pro`;
- there are two Web Purchase Links (trial and no-trial) with a success redirect to `https://learn.alphonsoecosystem.app/pro-return`;
- the RevenueCat **sandbox** web billing API key exists, with the v2 secret key if cancellation needs it.

The owner puts keys only in key files or env, never in chat.

- [ ] **Step 1:** From RevenueCat's docs (and verified in the sandbox where possible), record each answer under "## Task 0 results" at the bottom of this plan:
  1. the exact Web Purchase Link URL shape, how the `app_user_id` is passed, and whether extra query params survive;
  2. how the server reads the web offering's price, period and trial (endpoint, auth, response fields);
  3. whether RevenueCat itself refuses a second trial for a customer with App Store history, which decides whether the no-trial link is needed;
  4. the API call that cancels a Web Billing subscription immediately with no refund, and whether `DELETE /v1/subscribers/{id}` already does that;
  5. the `store` value and `management_url` that v1 `GET /v1/subscribers/{id}` returns for a web purchase, and which `CustomerInfo` fields expose them in the iOS SDK.
- [ ] **Step 2:** Make one sandbox purchase with Stripe test card `4242 4242 4242 4242` for a test Supabase user (the agent inbox account). Confirm that `GET /v1/subscribers/{that user id}` shows entitlement `pro` active.
- [ ] **Step 3:** If any answer contradicts a later task, edit that task before starting it, and tell the coordinator. Commit the plan update.

---

### Task 1: Subscriber summary and `GET /api/pro-status`

**Files:**
- Modify: `src/lib/revenuecat-entitlement.ts`
- Create: `src/routes/api/pro-status.ts`
- Test: `src/lib/revenuecat-entitlement.test.ts`, `src/routes/api/pro-status.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ProStore = "app_store" | "web" | "play_store" | null;
  export type SubscriberSummary =
    | { status: "unavailable" }
    | { status: "active" | "inactive"; store: ProStore; trialEligible: boolean; managementUrl: string | null };
  export async function getSubscriberSummary(config: RevenueCatConfig, appUserId: string, fetchImpl?: typeof fetch): Promise<SubscriberSummary>;
  ```
  `getProEntitlementStatus` keeps its signature and returns `summary.status`, so Hector's gate is unchanged.
- `GET /api/pro-status` with a `Bearer` session returns either
  `200 { pro: boolean, store: ProStore, trialEligible: boolean, manageUrl: string | null }`,
  or `401 { error: "unauthorized" }`,
  or `503 { error: "entitlement-unavailable" }`.

**Rules:**
- `store` comes from the `pro` entitlement's product in `subscriber.subscriptions[product].store`. Map `app_store` → `"app_store"`, Task 0 item 5's web value(s) → `"web"`, and `play_store` → `"play_store"`.
- `trialEligible` is `false` when `subscriber.subscriptions` has any entry, in any store.
- `managementUrl` is `subscriber.management_url`, but only when `store === "web"`.

- [ ] **Step 1: Write the failing tests:**
  - `active App Store Pro → store app_store, manageUrl null, trialEligible false`;
  - `active web Pro → store web, manageUrl from management_url`;
  - `404 subscriber → inactive, trialEligible true`;
  - `expired App Store subscription → inactive, trialEligible false`;
  - `5xx or malformed body → unavailable`;
  - `getProEntitlementStatus still returns the same three values` (the existing tests keep passing unchanged);
  - route: `no session → 401`, `RevenueCat not configured → 503`, `unavailable → 503 entitlement-unavailable`, `active → 200 pro true`.
- [ ] **Step 2:** Run `bun x vitest run src/lib/revenuecat-entitlement.test.ts src/routes/api/pro-status.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. The route verifies the session the way `hector-respond.ts` does (`supabaseAdmin.auth.getUser`). It sets `Cache-Control: no-store`.
- [ ] **Step 4:** Re-run. Expected: PASS. Mutation check: make `trialEligible` always `true`, and at least one test must go red.
- [ ] **Step 5:** Commit: `feat(pro): subscriber summary and /api/pro-status`.

---

### Task 2: Pro learners get their own Hector daily allowance

**Files:**
- Create: `supabase/migrations/20261102120000_hector_quota_kind.sql`
- Modify: `src/lib/ai-quota.server.ts` (`QuotaKind`, `DAILY_LIMITS`), `src/routes/api/hector-respond.ts`
- Test: `src/lib/ai-quota.server.test.ts`, `src/routes/api/hector-respond.test.ts`, plus the existing migration/limit-sync guard if there is one (search for `DAILY_LIMITS` in tests)

**Interfaces:** `QuotaKind` gains `"hector"`. `DAILY_LIMITS.hector = 150` (the proposed number, owner to confirm before launch; see Task 8). The per-minute `hector` limit is 10.

- [ ] **Step 1: Write the failing tests:**
  - `hector-respond consumes the hector quota, not chat, for an entitled learner`: the quota spy is called with `"hector"`;
  - `a not-entitled learner gets 403 and consumes no quota`: the spy is never called;
  - `DAILY_LIMITS.hector matches consume_ai_quota in the newest migration`: parse the SQL `WHEN 'hector' THEN 150`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Write the migration. It must `CREATE OR REPLACE` both `consume_ai_quota` and `consume_ai_rate_limit`, keep all existing kinds and values verbatim, and add `hector`. Then switch `consumeQuota(request, "chat")` to `"hector"` in `hector-respond.ts`. Keep the comment explaining why the allowance is separate (spec decision 8).
- [ ] **Step 4:** Run the tests, `deno test --allow-env supabase/functions/`, and the migration CI guard (`bun x vitest run src/lib/migrations*`). Expected: PASS. Then run the function as a seeded user in a rolled-back transaction via Supabase SQL: `select * from consume_ai_quota('hector')` returns allowed true, limit 150, and `consume_ai_quota('chat')` still has limit 60.
- [ ] **Step 5:** Commit: `feat(hector): separate Pro daily allowance`.

---

### Task 3: Account deletion cancels a web subscription before erasing

**Files:**
- Modify:
  - `src/lib/revenuecat-entitlement.ts`;
  - `src/lib/account.functions.ts` (`eraseSubscriberRecord`);
  - `src/lib/maintenance.server.ts` (`retryRevenueCatErasures`, `MaintenanceDeps`);
  - `src/routes/_authenticated/profile.tsx` (the delete confirmation copy near line 421).
- Test: `src/lib/revenuecat-entitlement.test.ts`, `src/lib/account.functions.test.ts` (or the existing erase tests), `src/lib/maintenance.server.test.ts`

**Interfaces:**
```ts
export async function cancelWebSubscription(config: RevenueCatConfig, appUserId: string, fetchImpl?: typeof fetch): Promise<"cancelled" | "none" | "failed">;
```
It returns `"none"` when there is no active web subscription; App Store subscriptions also count as `"none"`, since we cannot cancel those. It uses the call from Task 0 item 4. If Task 0 shows that `DELETE subscriber` already cancels web billing, `cancelWebSubscription` still runs first and returns `"cancelled"` / `"none"` after confirming via `getSubscriberSummary`. Either way, deletion never relies on an unverified side effect.

`MaintenanceDeps` gains `cancelWebSubscription: (config, id) => Promise<"cancelled" | "none" | "failed">`.

**Order:** cancel, then erase. `eraseSubscriberRecord` queues the user in `revenuecat_erasure_pending` if *either* step fails. In `retryRevenueCatErasures`, a row whose cancel still fails is **never expired**. It stays pending and logs `[account-deletion] a web subscription was NOT cancelled; still retrying` every run, and no user id is logged. The existing expiry applies only once cancel has returned `cancelled` or `none`.

- [ ] **Step 1: Write the failing tests:**
  - `erase cancels a web subscription first`: the call order is cancel then delete;
  - `a failed cancel queues the user and does not erase`;
  - `retry: failed cancel past ERASURE_RETRY_WINDOW_MS stays pending`;
  - `retry: none + erased clears the row`;
  - `App Store subscriber → none, no cancel call`;
  - profile: `delete confirmation says a web subscription is cancelled with no refund`.

  The web copy is exactly: `If you subscribed on this website, deleting your account cancels it right away. The current period is not refunded. App Store subscriptions are managed in your iPhone's Settings.`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Wire `cancelWebSubscription` into the maintenance deps factory near `maintenance.server.ts:320`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Mutation check: let an expired row with a failed cancel be deleted, and the retry test must go red.
- [ ] **Step 5:** Sandbox check: delete the Task 0 test user's account on a Vercel preview that has sandbox keys. Confirm in the RevenueCat and Stripe test dashboards that the subscription shows cancelled with no refund.
- [ ] **Step 6:** Commit: `feat(account): deleting an account cancels web billing first`.

---

### Task 4: Web offering endpoint, paywall copy and paywall component

**Files:**
- Create: `src/routes/api/pro-offering.ts`, `src/lib/paywall-copy.ts`, `src/lib/paywall-copy-parity.test.ts`, `src/components/WebPaywall.tsx`, `src/components/WebPaywall.test.tsx`
- Modify: `.env.example`, `README.md` (env section)

**Interfaces:**
- `GET /api/pro-offering?source=<paywall source>` with a session returns
  `200 { price: string, period: "month" | "year", trialDays: number | null, purchaseUrl: string }`,
  or `503 { error: "offering-unavailable" }`.
  - `price` is the offering's own formatted price and currency (Task 0 item 2).
  - `trialDays` is `null` when the user is not trial-eligible (Task 1).
  - `purchaseUrl` is built server-side from env `REVENUECAT_WEB_PURCHASE_LINK` (or `REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL` when not eligible) plus the user id, in Task 0 item 1's shape.
  - It sets the subscriber attribute `paywall_source` via `POST /v1/subscribers/{id}/attributes`, matching iOS `PaywallCopy.attributeKey`. An unknown `source` is rejected with 400.
- `src/lib/paywall-copy.ts` exports `PAYWALL_COPY` with:
  - `fallbackTitle: "Alphonso Pro"`, `mascotMessage: "Meet Hector, your AI tutor"`, `featureBlurb`;
  - `loadFailed`, `tryAgain`, `startFreeTrial: "Start free trial"`, `subscribe: "Subscribe"`, `manage: "Manage Subscription"`;
  - web-only strings: `manageOnIphone: "Manage it in your iPhone's Settings."`, `checkFailed: "Couldn't check your subscription. Try again."`, `activating: "Payment received, activating…"`.

  The parity test reads `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PaywallPresentation.swift` and requires each shared string to be identical.
- `<WebPaywall source={PaywallSource} />` loads `/api/pro-offering` and shows the price and trial lines. The button navigates the page to `purchaseUrl` (`window.location.assign`). The App Store's auto-renew disclosure wording is reused where the iOS paywall shows one (the `disclosure` style text).

- [ ] **Step 1: Write the failing tests:**
  - route: `eligible → trial link and trialDays`;
  - route: `has history → no-trial link, trialDays null`;
  - route: `offering fetch fails → 503, no price`;
  - route: `unknown source → 400`;
  - route: `sets paywall_source attribute`;
  - copy parity;
  - component: `shows Subscribe and no trial line when trialDays null`;
  - component: `shows loadFailed + tryAgain and no price on 503`;
  - component: `never renders a hardcoded price` (the rendered price equals the mocked API value).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, and add the env names to `.env.example` and the README.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(pro): web offering endpoint and paywall`.

---

### Task 5: The web Hector page, entry points and checkout return

**Files:**
- Create: `src/routes/_authenticated/hector.tsx`, `src/routes/_authenticated/pro-return.tsx`, `src/lib/use-pro-status.ts`, plus tests next to each
- Modify: `src/components/AppShell.tsx` (add a "Hector" tab after "Chat"), `src/routes/_authenticated/converse.tsx` (invitation card for non-Pro, source `practice_hector_card`), `src/routes/_authenticated/converse_.$scenarioId.tsx` (end-of-conversation "Continue with Hector" for non-Pro, source `practice_end_prompt`)

**Interfaces:**
- `useProStatus()` returns `{ state: "loading" | "pro" | "free" | "error", store, trialEligible, manageUrl, retry }`, read from `/api/pro-status`.
- `/hector`:
  - **free:** `<WebPaywall source="hector_tab">`;
  - **error:** `checkFailed` plus retry, never a paywall;
  - **pro:** the conversation.

  The conversation keeps the history client-side as `{ role: "user" | "assistant", content: string }[]` and sends the last 40 messages (`MAX_HISTORY_MESSAGES` in `src/lib/hector-conversation.ts`). Each turn posts `{ text, history, course, cefr_level }` to `/api/hector-respond` and plays `audioBase64` (same response shape iOS uses). The microphone comes from `useSpeechCapture({ onTranscript, course })`, and a text box is always present.
- Errors map as follows:
  - 403 `not-entitled` → paywall (`hector_not_entitled`);
  - 503 `entitlement-unavailable` → `checkFailed`;
  - 429 → the existing quota copy (`ai-quota-response`);
  - the consent response → the existing consent sheet flow.
- Manage link for Pro:
  - `store === "web"` → "Manage Subscription" opens `manageUrl`;
  - `"app_store"` → `manageOnIphone` text;
  - `"play_store"` → nothing.
- `/pro-return` polls `/api/pro-status` every 2 s for up to 30 s. On `pro` it navigates to `/hector`. Otherwise it shows `activating` plus retry, never an error and never the paywall.

- [ ] **Step 1: Write the failing tests:**
  - `free learner sees the paywall`;
  - `status error shows checkFailed not the paywall`;
  - `pro sends text, history, course and cefr_level and plays the reply`;
  - `a 403 mid-conversation shows the paywall`;
  - `mic failure leaves the text box usable`;
  - `App Store Pro shows manageOnIphone, web Pro shows a link to manageUrl`;
  - `pro-return: still inactive after 30 s shows activating + retry`;
  - `pro-return: active navigates to /hector`;
  - Practice card and end prompt: `hidden for Pro`, and `carry their source`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, reusing the Practice conversation UI pieces in `converse_.$scenarioId.tsx` where they fit (Canopy theme). Regenerate `routeTree.gen.ts` by running the dev build.
- [ ] **Step 4:** Run the tests plus `bun x tsc --noEmit`. Expected: PASS. Then on a Vercel preview with sandbox keys, use the **webapp-testing** skill (Playwright):
  - the Task 0 Pro test user can hold a typed turn and hear audio;
  - a free test user sees the paywall with the sandbox price;
  - the purchase link opens RevenueCat's checkout.
- [ ] **Step 5:** Commit: `feat(web): Hector on the web behind Alphonso Pro`.

---

### Task 6: Disclose web billing, and keep the legal pages steering-free

**Files:**
- Modify: `src/routes/privacy.tsx`, `src/routes/terms.tsx`, `src/lib/legal-required-phrases.ts`, `src/lib/app-store/review-notes.ts` (only if it describes payments)
- Test: `src/routes/legal-pages.test.tsx`, plus a new `src/routes/no-steering.test.tsx`

**Content:**
- **Privacy, processors list:**
  - `Stripe: processes card payments for subscriptions bought on the website. We never see or store your card number.`
  - `RevenueCat: records which subscription you have, on the website or the App Store, so Hector unlocks everywhere.` Merge this with the existing RevenueCat entry if there is one, keeping one entry.
- **Terms:**
  - Web subscriptions renew automatically until cancelled from "Manage Subscription".
  - Deleting your account cancels a website subscription immediately, with no refund of the current period.
  - App Store subscriptions follow Apple's terms.
- **Dates:** update the "updated" date on each changed page.
- **Required phrases:** add the Stripe sentence.

**Steering guard:** render each of `/`, `/terms`, `/privacy`, `/support`, `/cookies`, `/accessibility` and assert:
- no anchor whose href contains `/hector`, `/pro-return`, `pay.rev.cat` or the purchase-link host from Task 0;
- no currency amount (regex `/[$€£]\s?\d|\d\s?(USD|CAD|EUR)/`).

- [ ] **Step 1:** Write the failing tests (the phrases and the steering guard).
- [ ] **Step 2:** Run them. Expected: FAIL on the phrases. The steering guard may already pass, so confirm it can fail by mutating: add a `/hector` link to `LegalPage.tsx` temporarily, and it must go red.
- [ ] **Step 3:** Write the copy.
- [ ] **Step 4:** Run `bun x vitest run src/routes src/lib/app-store` (review notes must stay at or under 4,000 characters). Expected: PASS.
- [ ] **Step 5:** Commit: `docs(legal): name Stripe for web billing; steering guard`.

---

### Task 7: iPhone: "Manage Subscription" for web subscribers (ships in build 52)

**Files:**
- Modify:
  - `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/EntitlementController.swift` (`EntitlementSnapshot`);
  - `ios/LearnWithAlphonso/Sources/RevenueCatPurchases.swift` (`snapshot(_:)`);
  - `ios/LearnWithAlphonso/Sources/PaywallView.swift` (`manageButton`), plus any Settings row that opens `manageSubscriptionsSheet` (search for it).
- Test: the Kit tests for `EntitlementSnapshot`, plus `src/lib/ios-learning-flow-guards.test.ts`-style source guards if a SwiftUI branch can't be unit-tested.

**Interfaces:** `EntitlementSnapshot(isProActive: Bool, webManagementURL: URL? = nil)`. `webManagementURL` is set only when the `pro` entitlement's store is the web store from Task 0 item 5 (`CustomerInfo.entitlements[...].store`, `CustomerInfo.managementURL`). The default argument keeps every existing call site compiling.

**Behaviour:**
- When `webManagementURL != nil`, "Manage Subscription" opens it with `openURL`.
- Otherwise it keeps `manageSubscriptionsSheet`.
- The paywall's purchase path and copy are unchanged, with no web price, no web checkout link, and no mention of the website.

- [ ] **Step 1: Write the failing tests:**
  - Kit: `snapshot defaults webManagementURL to nil`;
  - Kit: `equal snapshots compare the URL`;
  - source guard: `PaywallView opens webManagementURL when present and never references pay.rev.cat or a price string`.
- [ ] **Step 2:** Run `swift test` in `ios/LearnWithAlphonsoKit` if it runs locally; otherwise push and read `ios-swift-tests` and `ios-app-build` in CI. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** CI `ios-swift-tests` and `ios-app-build` are green. If Limrun is available, use a web-Pro test account to confirm the button opens the portal page (record the result in the PR; it is not a gate).
- [ ] **Step 5:** Commit: `feat(ios): manage a web subscription from the iPhone`.

---

### Task 8: Rollout

- [ ] **Step 1 (owner):** set the env vars in Vercel Production and Preview: `REVENUECAT_WEB_PURCHASE_LINK`, `REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL`, plus any key Task 0 added. Preview uses the sandbox values and Production the live ones. Confirm `DAILY_LIMITS.hector` (150 proposed) against the cost per turn the agent reports from `[ai-timing]` logs and OpenRouter/Deepgram pricing.
- [ ] **Step 2 (agent):** open the PR, get the one Opus reviewer, wait for green CI, then squash-merge and watch `deploy-supabase` and the Vercel production deploy.
- [ ] **Step 3 (agent):** production smoke checks:
  - `/api/pro-status` without a session → 401;
  - a free test account sees the live price on `/hector`;
  - an App Store Pro test account sees Hector unlocked;
  - `check-legal-live` passes;
  - the steering guard passes against the live pages (fetch and grep).
- [ ] **Step 4 (owner):** one real live-mode purchase and cancel, refunded by the owner from Stripe, to prove live billing end to end.
- [ ] **Step 5 (agent):** update the memory, `D:/AgentDevWork/repos/Hackaton/SESSION-CONTEXT.md` and the local BACKLOG. Add the iOS change to the build 52 list for the owner.

## Task 0 results

_(filled in by Task 0)_

### From RevenueCat docs (2026-11-02, before the sandbox check)

1. **Purchase link:** `https://pay.rev.cat/<token>/<url-encoded app_user_id>`.
   - Query params: `email`, `currency`, `package_id`, `skip_purchase_success`, `metadata[key]=value`.
   - The success page is a custom redirect, and RevenueCat appends `app_user_id` to it.
   - **`paywall_source` goes as `metadata[paywall_source]=<source>`**, not via the v1 attributes call.
2. **Price:** only through v2 `GET /projects/{project_id}/products?expand=items.indicative_price`, which returns `{currency, amount_micros}` and ISO durations (`P1M`, trial `P7D`).
   - Needs a **v2 secret key** (`project_configuration:products:read`) and the project id, so the env vars are `REVENUECAT_V2_SECRET_KEY` and `REVENUECAT_PROJECT_ID`.
   - There is no formatted string, so format with `Intl.NumberFormat(currency)`.
   - The v1 offerings endpoint returns no prices.
3. **Trial eligibility** is a per-product RevenueCat setting.
   - The owner sets it to **"Didn't have any subscription yet"** (project-wide, which should include App Store history).
   - Our `trialEligible` then only decides the label. If the sandbox confirms RevenueCat refuses the second trial, we keep one link and drop `REVENUECAT_WEB_PURCHASE_LINK_NO_TRIAL`.
4. **Cancel:** v2 `POST /projects/{pid}/subscriptions/{sid}/actions/cancel` (`customer_information:subscriptions:read_write`).
   - It cancels at **period end**: no further charge, no refund.
   - v1 `DELETE subscriber` is not documented to cancel anything.
   - Finding the subscription id for a customer is not documented; confirm in the sandbox.
5. **Store values:**
   - The v1 `store` value for Web Billing is not documented (likely `rc_billing`). Confirm in the sandbox.
   - `management_url` returns the configured customer portal for Stripe Billing.
   - iOS has `Store.rcBilling` (purchases-ios #3773).
