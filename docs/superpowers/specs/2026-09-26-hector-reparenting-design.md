# Hector Re-Parenting: Design Options

> **Status: approved 2026-09-26.** Phases 0, 1, and 2 below are all
> go — see this repo's history for the implementation PRs each phase
> landed as. Written 2026-09-25 as a design/decision doc, not an
> implementation plan, per explicit instruction to spec first. Unlike
> `2026-09-20-hector-weakness-detection-design.md` (still pre-decision,
> still gitignored), this one is committed: the reasoning here —
> especially that AlphonsoCompanion, not this app, is Cloud Voice's
> primary tenant — is durable and worth keeping in shared history now
> that it's decided.

## Why this exists

Account deletion (`deleteMyAccount`, `src/lib/account.functions.ts`) and
the Session B / Session C work that shipped native deletion, block/report,
and Keychain persistence all deleted or protected data in **this app's**
Supabase project (`qhcjpfbxfcltjbiuknyt`). None of it can reach Hector.

`HectorView.swift:50` already tells the user why, honestly: *"Hector uses
a separate account from your main Learn with Alphonso sign-in."*
`AppConfig.swift:26` shows the mechanism — Hector's Cloud Voice backend
lives in a genuinely different Supabase project
(`ywavjlmjbxuslbxactsx`), owned and operated by a different codebase
(`AlphonsoEcosystem`, checked out locally at
`D:\AgentDevWork\repos\AlphonsoEcosystem`). Deleting the main account
today leaves a Cloud Voice account alive in a database the deletion code
has never heard of, and always will, until this is addressed.

This was flagged and deliberately deferred during the deletion work as
"architecture, not a four-day job." This doc is that architecture pass.

## Current architecture (verified against both repos)

**This app's side** (`ios/LearnWithAlphonso/Sources/HectorSession.swift`,
`HectorView.swift`): Hector is gated by a RevenueCat "pro" entitlement
(client-side only — see below) *and* a fully separate sign-in: email OTP
against `AppConfig.cloudVoiceSupabaseURL`, followed by
`DeviceEnrollmentClient.enroll(deviceID:displayName:accessToken:)`
(`POST {cloud voice}/v1/voice/devices/enroll`). Only after both succeed
does `HectorConversationView` call `TutorConversationClient.respond()`
(`POST {cloud voice}/v1/voice/respond`) with the Cloud Voice access
token.

**Cloud Voice's side** (`AlphonsoEcosystem/voice/cloud-backend/app/`):

- `supabase_auth.py`'s `SupabaseDeviceRegistry.user_from_authorization`
  validates the bearer token by calling
  `{cloud voice supabase_url}/auth/v1/user` — GoTrue verifying the JWT
  against **that project's own signing key**. A token issued by this
  app's project (`qhcjpfbxfcltjbiuknyt`) does not and cannot validate
  here; Supabase JWTs are not portable across projects. This is a hard
  constraint, not a configuration oversight.
- `main.py`'s `/v1/voice/respond` (the actual conversation endpoint) and
  `/v1/voice/sessions/analyze` both require
  `SupabaseDeviceRegistry.require_active_device` — a valid Cloud Voice
  session **and** an enrolled, non-revoked row in Cloud Voice's own
  `voice_devices` table, keyed to Cloud Voice's own `auth.users`.
- `app/auth.py`'s `require_bearer_token` is a separate, already-existing
  **function**: a static shared-secret check, unrelated to any user
  identity. Correction after a closer look: it is **not currently wired
  to any endpoint or config value** — `Settings` (`app/config.py`) has
  no shared-secret field at all, so this is dead code today, not a live
  mechanism. Still the right shape to reuse (a new `Settings` field plus
  one call to this existing function, for each new endpoint below) —
  just accurate to say it needs wiring, not just reuse.
- `DeviceEnrollmentClient.swift`'s own doc comment says the quiet part:
  it is *"a direct Swift port of `VoiceCloudService.enrollCurrentDevice`
  (`AlphonsoEcosystem/ios/AlphonsoCompanion/.../VoiceCloudService.swift`),
  which is the real, already-working reference for this exact
  endpoint."* **AlphonsoCompanion is this backend's primary product.**
  This app is a secondary consumer riding on infrastructure built for a
  different app. Confirmed independently: nothing in
  `AlphonsoEcosystem`'s own docs (`IOS_COMPANION_HANDOFF.md`,
  `IOS_COMPANION_PLAN.md`, `ARCHITECTURE.md`) mentions `LearnWithAlphonso`
  at all.

**Also verified, a real prerequisite gap:** this app's backend has *no*
server-side way to check a user's RevenueCat "pro" status today (no
webhook, no stored entitlement column — `grep -rn "revenuecat" src
supabase` turns up nothing relevant). "Pro" is enforced purely
client-side by `EntitlementStore` reading the RevenueCat SDK. Any design
that gates a server-side action on entitlement needs this solved first,
independent of Hector.

## Question 1: Can Hector become an entitlement on the primary account rather than a second login?

**Not by literally merging the accounts** — that would mean Cloud
Voice's `voice_devices` (and whatever else lives in its schema) start
being keyed by *this app's* `auth.users`, which Cloud Voice's own
`/auth/v1/user` check structurally cannot accept from a different
project's JWT without a real backend change on AlphonsoEcosystem's side.
And since AlphonsoCompanion is the primary tenant of that backend, a
change to how it authenticates is a cross-product change this repo does
not own or control — the "real fix" (Option 2 below) needs
AlphonsoEcosystem's buy-in, not just this repo's engineering time.

**Yes, from the user's point of view**, via a server-side shadow account
this app's backend manages on the user's behalf (Option 1). The user
never sees a second sign-in prompt; Hector is unlocked purely by the
Pro entitlement. Under the hood, a second Supabase identity still
exists (Cloud Voice's architecture requires it today), but the app
provisions and authenticates it silently:

1. First time a Pro subscriber opens Hector — **gated on a real,
   server-verified Pro check (see the prerequisite gap above); this
   ordering is load-bearing, not optional** — this app's backend (not
   the client) calls a **new, small endpoint on Cloud Voice's backend**
   — e.g. `POST /v1/voice/link-account` — authenticated with a
   pre-shared static secret (reusing `app/auth.py`'s existing
   `require_bearer_token` function/shape, wired to a new config value —
   nothing new invented beyond one endpoint and one secret on Cloud
   Voice's side). That endpoint looks up or creates a Cloud Voice
   `auth.users` row tagged with this app's `user_id` in `app_metadata`,
   enrolls the current device, and mints a session (access + refresh
   token) for it — returning that pair.
2. This app's backend returns that token pair to the iOS client, which
   uses it exactly like today's `.ready(accessToken:)` state.
   `HectorSession`'s `HectorEmailStep`/`HectorCodeStep` UI goes away
   entirely.
3. This app's own database gains one small mapping table,
   `hector_links (user_id, cloud_voice_user_id, linked_at)`, written
   when step 1 succeeds — **this table is what makes Question 3
   possible**, and does not depend on step 1 existing yet (see Phase 0).

Why a shadow account rather than eliminating the second identity:
Cloud Voice's schema and auth model are not this repo's to change
unilaterally, and duplicating its `voice_devices`/session logic into
this app's own project would be a second implementation of exactly the
kind this repo's own history (`remove_friend`, GDPR export table drift)
shows is how these things rot. Keeping Cloud Voice as the single
implementation, invisible instead of removed, is the smaller and safer
move.

**Real fix, if ever pursued:** AlphonsoEcosystem's cloud-backend
becomes tenant-aware — validates a bearer token against either Supabase
project depending on a claim/header, and `voice_devices` (etc.) drops
its FK to a single project's `auth.users` in favor of a plain UUID plus
a `tenant` column. This is a genuine architecture change to a product
this repo doesn't own; out of scope to design further here without
AlphonsoEcosystem's own engineering involved.

## Question 2: What does migration do to existing Hector accounts?

Existing Hector users already have a real, independent Cloud Voice
identity with no recorded link to their main account (there is no
`hector_links` row for them, retroactively, because nothing wrote one).
Two sub-cases:

- **New Pro subscribers, post-launch of Option 1:** never see the old
  email/OTP flow at all; shadow-provisioned transparently. No migration
  needed for these — they don't exist yet.
- **Existing Hector users (already enrolled via email/OTP):** cannot be
  silently mapped. The main account's email and the Cloud Voice
  account's email are not guaranteed to match (Apple private-relay
  emails are explicitly called out as a case where they never will —
  see `SupabaseAuthClient.signInWithIDToken`'s doc comment), so there is
  no safe automatic pairing. Two honest options, not mutually
  exclusive:
  1. **One-time explicit reconciliation:** next time an existing Hector
     user opens Hector, if a `hector_links` row for their main account
     doesn't exist yet, ask them to confirm ("Is this your existing
     Hector sign-in?") rather than guessing, then write the link. Their
     existing device enrollment and any server-side history stay
     exactly as-is.
  2. **Treat as orphaned, re-provision fresh:** simpler, but only
     defensible if Cloud Voice retains no meaningful per-user history
     worth preserving (needs checking against Cloud Voice's actual
     schema/retention before deciding — not verified as part of this
     doc; flagged as an open question below).
  
  Recommendation: (1), because it is strictly safer and doesn't require
  first proving (2)'s assumption. It also directly produces the
  `hector_links` row Question 3 needs, for the population that needs it
  most (existing users deletion currently *cannot* reach).

## Question 3: What's the smallest step that makes deletion reach it?

**It does not have to wait for Option 1 to ship.** The blocker for
deletion isn't the second-login UX — it's that nothing today records
which Cloud Voice account belongs to which main account. That mapping
is the one missing piece, and it's obtainable immediately, under the
*current* architecture, with a small, self-contained change:

**Phase 0 (smallest step, ships independently, no AlphonsoEcosystem
change needed):**

1. Add the `hector_links (user_id, cloud_voice_user_id, linked_at)`
   table to this app's own Supabase project (this repo's migration,
   this repo's RLS — `blocked_users`/`content_reports`
   pattern from the block-and-report work is a reasonable template: a
   user reads their own row, writes are server-verified not
   client-trusted).
2. After `HectorSession.verifyCodeAndEnroll` succeeds today (the
   *existing* email/OTP flow, unchanged), the client already holds both
   identities in memory at once — the main `Session`'s `userID`/
   `accessToken` (`HectorView` already has `session: Session` alongside
   `hectorSession: HectorSession`) and the freshly-created Cloud Voice
   `SupabaseSession.userID`. One new call, `POST /api/hector-link`
   (this app's own backend, same shape as `/api/apple-link`), records
   the pairing.
3. `deleteMyAccount` (`src/lib/account.functions.ts`) gains one more
   step, same posture as the Apple-revocation addition: look up
   `hector_links` for this user, and if a row exists, call a **new**
   revocation-style endpoint on Cloud Voice's backend (again, the
   existing `require_bearer_token` shared-secret mechanism — no new
   trust surface) to revoke/delete that Cloud Voice account, then
   delete the `hector_links` row. Soft-fail exactly like Apple
   revocation does today: log it, never block the user's own deletion
   on a second system being reachable.
4. Confirmation copy in `SettingsView`'s delete-account alert updates
   from "This does not delete a separate Hector sign-in... sign out of
   Hector separately" to something true once this ships — e.g. "Your
   Hector sign-in, if you have one, is deleted too."

This closes the actual compliance gap (deletion reaching Hector) without
touching the sign-in UX, without a shadow-account concept, and without
needing AlphonsoEcosystem to build anything beyond one small revoke
endpoint using the `require_bearer_token` shape already present in
their codebase. **Phase 0 shipped first, standalone.**

**Phase 1** is Question 1's shadow-account design (invisible sign-in) —
its first task, not a footnote, is building the RevenueCat
server-side-entitlement prerequisite (none exists today — see above),
tested, with the shadow-account creation call gated on it. It also
needs one more new endpoint (`/v1/voice/link-account`) on Cloud Voice's
side. `hector_links` from Phase 0 is reused unchanged as the mapping
table.

**Phase 2** is Question 2's answer, applied: the one-time explicit
reconciliation prompt for existing Hector users, so Phase 0's deletion
step reaches people who enrolled before any of this shipped, not just
new links going forward. Depends on Phase 0's schema; does not depend
on Phase 1.

**Full re-parenting** (Cloud Voice becomes tenant-aware, the second
identity disappears entirely) is **not** one of the three approved
phases — it's a cross-product architecture change owned by
AlphonsoEcosystem, permanently out of this repo's scope until that
team takes it up. Tracked here as a non-goal, not a future phase.

## Non-goals (explicitly out of scope for all three approved phases)

- Full re-parenting: rewriting or forking Cloud Voice's backend, or
  making it tenant-aware, for this app's benefit. AlphonsoEcosystem's
  to take up, not this repo's.
- Migrating conversation history, TTS voice preferences, or any other
  Cloud Voice state beyond the account/device identity itself — not
  verified what else exists there (see open question 3 below); out of
  scope regardless until that's known.
- Removing Hector as a feature, or changing its Pro-gating model beyond
  what's described above.

## Decided, so a future reader doesn't have to re-derive it

- **A user who never answers Phase 2's reconciliation prompt stays
  unlinked, permanently, by default.** Their main-account deletion
  still proceeds in full — `hectorRevoked: false` (same shape as
  `appleRevoked: false`) — and their old Cloud Voice account is simply
  never reached, exactly the status quo before any of this shipped.
  Nothing re-prompts them automatically; re-prompting on every
  deletion attempt would block deletion on a decision that isn't
  theirs to be forced into at that moment. Silent auto-pairing on an
  email match was considered and rejected: private-relay and
  mismatched emails mean it would eventually join two strangers'
  accounts, which is unrecoverable.

## Open questions still needing a human answer

These are cross-repo/ops items this session cannot resolve alone —
specified precisely and handed off at the point each phase needs them,
not worked around.

1. **AlphonsoEcosystem coordination:** the account owner arranges the
   actual endpoint work on Cloud Voice's side (a revoke endpoint for
   Phase 0; `/v1/voice/link-account` plus a shared-secret config value
   for Phase 1). Each phase's PR specifies the exact contract needed —
   method, payload, auth, expected responses — and stops there; no
   workaround that pretends an endpoint exists before it does.
2. **Cloud Voice's actual per-user data retention** (conversation
   history, transcripts, TTS preferences) — unverified in this pass.
   Only matters if/when full re-parenting is ever taken up; not a
   blocker for Phases 0-2.
3. **RevenueCat server-side verification's ownership** — this spec
   treats it as Phase 1's own prerequisite and builds it there; flag
   here in case it turns out to already be planned/in-flight elsewhere,
   to avoid two implementations.
