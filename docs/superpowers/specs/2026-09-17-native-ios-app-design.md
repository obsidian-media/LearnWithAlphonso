# Design: Native iOS App for english-buddy-app-33 ("Learn with Alphonso")

> Written 2026-09-17. Shipaton 2026 submission window closes 2026-09-30 —
> ~13 days from this doc. Every V1 decision below is made against that
> deadline; V2/V3 are explicitly not deadline-bound.

## Why this exists

english-buddy-app-33 is a mature, deployed, real product: 534 English
lessons + 125 French lessons across 5 CEFR levels, an SM-2 spaced-repetition
review system, gamification (XP/streaks/leagues/hearts), leaderboards,
friends, and an AI conversation feature (6 scenarios, NVIDIA NIM chat +
Deepgram TTS/STT) — currently a TanStack Start (React 19, SSR) web app
deployed to Vercel.

Shayan wants this shipped as a **real native iOS app** — not a tab bolted
onto another app, not a WebView wrapper — as the Shipaton 2026 submission.
This doc scopes what "native" actually means against a 13-day deadline,
without pretending a full rewrite of everything is possible in that window.

## Explicitly rejected alternatives (so they don't get re-proposed)

- **WKWebView tab inside AlphonsoCompanion.** Rejected: felt "basic," and
  conflates two unrelated products (AlphonsoCompanion also ships
  internal fleet-management tooling — Operations/Boardroom/Agents/Connect
  tabs — unrelated to language learning and not something to expose in a
  consumer Shipaton submission).
- **Capacitor-wrapped standalone app.** Considered as a middle ground
  (bundles the real web UI into a native shell, real app-shell behavior,
  achievable in the timeline). Rejected in favor of native Swift once the
  "basic" objection turned out to be about being a tab in someone else's
  app, not about Capacitor specifically — Shayan wants native Swift
  regardless.
- **Full native rewrite of every feature by Sept 30.** Not proposed as V1
  scope — see "The honest constraint" below for why, and the V1/V2/V3
  breakdown for how the real scope is sequenced instead.

## The honest constraint

**There is no Swift toolchain in the environment building this.** Every
Swift file for this project is written pattern-matched against existing
conventions, never compiled, until someone with a Mac and Xcode builds it.
This means the realistic workflow is iterative — write in bursts, a human
compiles and reports real errors back, fix, repeat — not "hand over a
finished app." Budget real calendar time for that loop, not just writing
time. This is the single biggest execution risk on the whole timeline, bigger
than any individual feature's complexity.

**Content is not the bottleneck.** The 534+125 lessons live as structured
data (`src/data/curriculum.ts`, `curriculumFr`), not hand-authored prose
needing rewriting. Exporting it to bundled JSON is a data-transform job, not
a content-creation job. The SM-2 algorithm (`src/lib/srs.ts`, 92 lines, pure
function, zero framework dependencies) is directly portable. **The real
native engineering is UI screens and the AI conversation integration**, not
data or algorithms.

## Architecture

A new Xcode project at `english-buddy-app-33/ios/LearnWithAlphonso/`
(matching the pattern AlphonsoEcosystem already uses: repo root +
`ios/<AppName>/`), SwiftUI, targeting iOS matching AlphonsoCompanion's
deployment target for consistency.

**Two backends, each reused for what it's already good at — no new backend
stood up, no data migration:**

1. **english-buddy-app-33's existing Supabase project** — auth, lesson
   progress, SRS review state, gamification, leaderboards/friends (V2+).
   The native app is a new client against the *same* backend the web app
   already uses; a user's account is one account regardless of which
   client they use. Reuses the existing schema/migrations/RLS policies
   as-is — this native app writes to the same tables the web app's server
   functions do today (via direct Supabase client calls from the app,
   since there's no TanStack Start server layer on iOS — see "Data flow
   changes vs. the web app" below for what that implies).
2. **AlphonsoCompanion's voice/cloud-backend** (built and merged to `main`
   this session, ca-central-1 ECS Fargate, `voice.obsidianmedia.online`)
   — the AI conversation feature calls the *same* `/v1/voice/respond` and
   `/v1/voice/sessions/analyze` endpoints already built for AlphonsoCompanion,
   using the `tutor` persona (Hector) rather than reimplementing a third
   voice pipeline against NVIDIA/Deepgram directly. This is a real
   technical merge of the two products at the backend level even though
   the frontends stay separate codebases — Hector's pedagogy and the
   weakness-detection loop aren't rebuilt twice.
   - Requires this app's users to also be enrolled as Cloud Voice
     devices against `voice.obsidianmedia.online`'s Supabase project — a
     **second**, separate sign-in from the english-buddy account (same
     "two backends, two logins" reality noted in the rejected WebView
     approach, just now scoped to one specific feature instead of the
     whole app). Acceptable for V1: the AI conversation feature is a
     secondary flow, not the account-creation gate.

### Data flow changes vs. the web app

The web app's lesson-completion/SRS/quota logic lives in TanStack Start
server functions (`src/lib/*.functions.ts`) — server-side code with
service-role-level trust boundaries (see `AUDIT.md`'s trust-boundary notes).
A native iOS client can't run that server code; it talks to Supabase
directly with the user's own JWT, under RLS. **This means the native app's
read/write paths need their own thin server-function-equivalent — likely
Supabase Edge Functions duplicating the specific trust-sensitive logic
(lesson-completion validation, quota checks) rather than trusting the
client to self-report XP/completion.** This is real, necessary backend work,
not just an iOS client — flagged explicitly here so it isn't discovered
late as a surprise "oh, we also need this."

### Components (native, SwiftUI)

- `LessonContentStore` — loads the bundled lesson JSON (English + French,
  all 534+125 lessons, exported once from `curriculum.ts`/`curriculumFr`
  by a small Node script committed to this repo, re-run whenever content
  changes — not hand-maintained twice).
- `SRSEngine` — direct Swift port of `src/lib/srs.ts`'s `computeReviewGrade`
  (pure function, trivially testable with XCTest against the same fixed
  cases as `srs.test.ts`).
- `ProgressStore` — Supabase-backed read/write for lesson completion, XP,
  streaks; calls the new Edge Functions from "Data flow changes" above for
  anything trust-sensitive.
- `LessonPlayerView` — renders the two existing question types (multiple
  choice, fill-in-blank) against the bundled content.
- `ReviewQueueView` — due-item queue, wired to `SRSEngine`.
- `ConversationView` — scenario picker (reuses `SCENARIOS` data, exported
  the same way as lesson content) + a voice conversation screen calling
  AlphonsoCompanion's voice backend with the `tutor` persona.
- `AuthView` — Supabase email/OTP sign-in against english-buddy's project
  (the existing web app's auth pattern, ported — not a new auth design).

### Error handling

- Network failures during lesson play: local-first where possible (a
  lesson already loaded from the bundle plays fully offline; only
  completion sync needs connectivity, queued and retried rather than
  blocking the UI).
- AI conversation failures: mirrors AlphonsoCompanion's existing pattern
  (`VoiceCloudError` cases, safe user-facing messages) — reused directly,
  not redesigned.
- Two separate auth states (english-buddy account vs. Cloud Voice
  enrollment) must fail independently and legibly — a user should be able
  to use lessons/SRS/gamification fully even if Cloud Voice enrollment
  fails or is skipped, since AI conversation is one feature among several.

### Testing

- `SRSEngine`: XCTest against the same fixed input/output cases already in
  `srs.test.ts` — a direct port should produce identical results, and the
  existing test file is the source of truth for what "correct" means here.
- `LessonContentStore`: a snapshot test asserting the bundled JSON's lesson
  count matches `curriculum.ts`'s real count at export time (534 English /
  125 French as of 2026-09-13 — catches silent content drift between the
  web app and the native export).
- Manual QA for `LessonPlayerView`/`ReviewQueueView`/`ConversationView` —
  no Xcode UI-test infrastructure assumed given the no-toolchain
  constraint; real device/simulator testing happens on Shayan's Mac, not
  in this development environment.

## Phased scope

### V1 — Shipaton submission (by 2026-09-30)

- [ ] Native SwiftUI app scaffolded (`ios/LearnWithAlphonso/`)
- [ ] Content export script (curriculum → bundled JSON), run once, committed
- [ ] Supabase auth (email/OTP), reusing english-buddy's existing project
- [ ] Lesson browser (units/levels, English + French)
- [ ] Lesson player (multiple-choice + fill-in-blank)
- [ ] Lesson-completion sync via a new Edge Function (trust boundary, per
      "Data flow changes" above)
- [ ] SRS review queue (native `SRSEngine` port + due-item UI)
- [ ] Core gamification: XP, streaks (hearts/streak-freezes deferred to V2
      — see below)
- [ ] AI conversation via AlphonsoCompanion's voice backend (`tutor`
      persona, scenario-based, reusing `SCENARIOS`)
- [ ] StoreKit/RevenueCat: at least one real IAP (Shipaton's hard
      requirement) — needs a concrete decision on what's paid (e.g., a
      "Pro" tier gating advanced levels or unlimited AI conversation
      minutes) — **not yet decided, needs a follow-up conversation before
      implementation**
- [ ] Signed TestFlight build, then App Store submission before the
      window closes

### V2 — near-term, not deadline-bound

- [ ] Leaderboards (global/friends/country) — real backend query work
      deferred from V1 deliberately
- [ ] Friends system (invite links)
- [ ] Full gamification: leagues (Bronze→Diamond), hearts + refill
      countdown, streak freezes, achievements
- [ ] Weakness-detection pipeline adapted for english-buddy's own user
      base specifically (V1's AI conversation uses the pipeline as-is
      against Cloud Voice's separate account system; V2 explores whether
      it should instead key off the english-buddy account directly)
- [ ] Tighter integration between the two separate logins (English-buddy
      account + Cloud Voice enrollment) — ideally a single sign-in
      experience, not two

### V3 — longer-term

- [ ] Offline-first: full lesson catalog cached, review queue works
      fully offline, sync-on-reconnect
- [ ] Push notifications (streak reminders, due-review nudges)
- [ ] Android version
- [ ] Deeper design-system/account convergence with AlphonsoCompanion,
      if the two products' user bases turn out to genuinely overlap
      enough to justify it (not assumed here — a real decision for later,
      not a foregone conclusion)

## Open questions (need answers before/during V1 implementation, not blocking this doc)

1. **RevenueCat IAP definition** — what's actually paywalled? Needs a
   product decision, not an engineering one.
2. **Deployment target / minimum iOS version** — defaulting to
   AlphonsoCompanion's target for consistency (see Architecture); flag
   here only if there's a reason to diverge (e.g. a SwiftUI API this app
   needs that AlphonsoCompanion's target doesn't support).
3. **App name/bundle ID/icon** — "Learn with Alphonso" per existing
   branding decisions (`docs/DESIGN-english-buddy-33-branding.md` in the
   Boardroom repo), but the concrete bundle identifier and App Store
   Connect app record don't exist yet and need creating.
4. **Signing/certificates** — AlphonsoCompanion's signing was already
   solved (GitHub secrets from June 2026, per
   `docs/HANDOFF-alphonso-language-companion.md`). This is a **different**
   app needing its own App Store Connect record, provisioning profile, and
   possibly its own signing secrets — do not assume AlphonsoCompanion's
   existing signing setup covers this new app.
